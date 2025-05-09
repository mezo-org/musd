// SPDX-License-Identifier: MIT

pragma solidity 0.8.24;

import "@openzeppelin/contracts-upgradeable/access/Ownable2StepUpgradeable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

import "./BorrowerOperations.sol";
import "./dependencies/CheckContract.sol";
import "./dependencies/SendCollateral.sol";
import "./interfaces/IPCV.sol";
import "./token/IMUSD.sol";

contract PCV is CheckContract, IPCV, Ownable2StepUpgradeable, SendCollateral {
    uint256 public constant BOOTSTRAP_LOAN = 1e26; // 100M mUSD

    uint256 public governanceTimeDelay;

    BorrowerOperations public borrowerOperations;
    IMUSD public musd;

    // TODO ideal initialization in constructor/setAddresses
    uint256 public debtToPay;
    bool public isInitialized;

    address public council;
    address public treasury;

    mapping(address => bool) public recipientsWhitelist;

    address public pendingCouncilAddress;
    address public pendingTreasuryAddress;
    uint256 public changingRolesInitiated;

    address public feeRecipient;
    uint8 public feeSplitPercentage; // percentage of fees to be sent to feeRecipient
    uint8 public constant FEE_SPLIT_MAX = 50; // no more than 50% of fees can be sent until the debt is paid

    modifier onlyAfterDebtPaid() {
        require(isInitialized && debtToPay == 0, "PCV: debt must be paid");
        _;
    }

    modifier onlyOwnerOrCouncilOrTreasury() {
        require(
            msg.sender == owner() ||
                msg.sender == council ||
                msg.sender == treasury,
            "PCV: caller must be owner or council or treasury"
        );
        _;
    }

    modifier onlyWhitelistedRecipient(address _recipient) {
        require(
            recipientsWhitelist[_recipient],
            "PCV: recipient must be in whitelist"
        );
        _;
    }

    function initialize(uint256 _governanceTimeDelay) external initializer {
        __Ownable_init(msg.sender);

        require(
            _governanceTimeDelay <= 30 weeks,
            "Governance delay is too big"
        );
        governanceTimeDelay = _governanceTimeDelay;
    }

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    receive() external payable {}

    function setAddresses(
        address _borrowerOperations,
        address _musdTokenAddress
    ) external override onlyOwner {
        require(address(musd) == address(0), "PCV: contacts already set");

        checkContract(_borrowerOperations);
        checkContract(_musdTokenAddress);

        // slither-disable-start missing-zero-check
        borrowerOperations = BorrowerOperations(_borrowerOperations);
        musd = IMUSD(_musdTokenAddress);
        // slither-disable-end missing-zero-check

        emit BorrowerOperationsAddressSet(_borrowerOperations);
        emit MUSDTokenAddressSet(_musdTokenAddress);
    }

    function initializeDebt() external override onlyOwnerOrCouncilOrTreasury {
        require(!isInitialized, "PCV: already initialized");

        debtToPay = BOOTSTRAP_LOAN;
        isInitialized = true;
        borrowerOperations.mintBootstrapLoanFromPCV(BOOTSTRAP_LOAN);
        depositToStabilityPool(BOOTSTRAP_LOAN);
    }

    function setFeeRecipient(
        address _feeRecipient
    ) external onlyOwnerOrCouncilOrTreasury {
        require(
            _feeRecipient != address(0),
            "PCV: Fee recipient cannot be the zero address."
        );
        feeRecipient = _feeRecipient;
        emit FeeRecipientSet(_feeRecipient);
    }

    function setFeeSplit(
        uint8 _feeSplitPercentage
    ) external onlyOwnerOrCouncilOrTreasury {
        require(
            feeRecipient != address(0),
            "PCV must set fee recipient before setFeeSplit"
        );
        require(
            (debtToPay > 0 && _feeSplitPercentage <= FEE_SPLIT_MAX) ||
                (debtToPay == 0 && _feeSplitPercentage <= 100),
            "PCV: Fee split must be at most 50 while debt remains."
        );
        feeSplitPercentage = _feeSplitPercentage;

        emit FeeSplitSet(_feeSplitPercentage);
    }

    function distributeMUSD(
        uint256 _amount
    ) external override onlyOwnerOrCouncilOrTreasury {
        require(
            _amount <= musd.balanceOf(address(this)),
            "PCV: not enough tokens"
        );

        uint256 distributedFees = (_amount * feeSplitPercentage) / 100;
        uint256 protocolLoanRepayment = _amount - distributedFees;
        uint256 stabilityPoolDeposit = 0;

        // check for excess to deposit into the stability pool
        if (protocolLoanRepayment > debtToPay) {
            stabilityPoolDeposit = protocolLoanRepayment - debtToPay;
            protocolLoanRepayment = debtToPay;
        }

        _repayDebt(protocolLoanRepayment);

        if (stabilityPoolDeposit > 0) {
            depositToStabilityPool(stabilityPoolDeposit);
        }

        // send funds to feeRecipient address, if the feeRecipient hasnt been set then the feeSplitPercentage = 0
        if (feeRecipient != address(0) && distributedFees > 0) {
            require(
                musd.transfer(feeRecipient, distributedFees),
                "PCV: sending mUSD failed"
            );

            // slither-disable-next-line reentrancy-events
            emit PCVDistribution(feeRecipient, distributedFees);
        }
    }

    function withdrawMUSD(
        address _recipient,
        uint256 _amount
    )
        external
        override
        onlyOwnerOrCouncilOrTreasury
        onlyAfterDebtPaid
        onlyWhitelistedRecipient(_recipient)
    {
        require(
            _amount <= musd.balanceOf(address(this)),
            "PCV: not enough tokens"
        );
        require(musd.transfer(_recipient, _amount), "PCV: sending mUSD failed");

        // slither-disable-next-line reentrancy-events
        emit MUSDWithdraw(_recipient, _amount);
    }

    function withdrawCollateral(
        address _recipient,
        uint256 _collateralAmount
    )
        external
        override
        onlyOwnerOrCouncilOrTreasury
        onlyWhitelistedRecipient(_recipient)
    {
        _sendCollateral(_recipient, _collateralAmount);

        // slither-disable-next-line reentrancy-events
        emit CollateralWithdraw(_recipient, _collateralAmount);
    }

    function addRecipientsToWhitelist(
        address[] calldata _recipients
    ) external override onlyOwner {
        require(
            _recipients.length > 0,
            "PCV: Recipients array must not be empty"
        );
        for (uint256 i = 0; i < _recipients.length; i++) {
            addRecipientToWhitelist(_recipients[i]);
        }
    }

    function removeRecipientsFromWhitelist(
        address[] calldata _recipients
    ) external override onlyOwner {
        require(
            _recipients.length > 0,
            "PCV: Recipients array must not be empty"
        );
        for (uint256 i = 0; i < _recipients.length; i++) {
            removeRecipientFromWhitelist(_recipients[i]);
        }
    }

    function startChangingRoles(
        address _council,
        address _treasury
    ) external override onlyOwner {
        require(
            _council != council || _treasury != treasury,
            "PCV: these roles already set"
        );

        // solhint-disable-next-line not-rely-on-time
        changingRolesInitiated = block.timestamp;
        if (council == address(0) && treasury == address(0)) {
            // solhint-disable-next-line not-rely-on-time
            changingRolesInitiated -= governanceTimeDelay; // skip delay if no roles set
        }
        pendingCouncilAddress = _council;
        pendingTreasuryAddress = _treasury;
    }

    function cancelChangingRoles() external override onlyOwner {
        require(changingRolesInitiated != 0, "PCV: Change not initiated");

        changingRolesInitiated = 0;
        pendingCouncilAddress = address(0);
        pendingTreasuryAddress = address(0);
    }

    function finalizeChangingRoles() external override onlyOwner {
        require(changingRolesInitiated > 0, "PCV: Change not initiated");
        require(
            // solhint-disable-next-line not-rely-on-time
            block.timestamp >= changingRolesInitiated + governanceTimeDelay,
            "PCV: Governance delay has not elapsed"
        );

        council = pendingCouncilAddress;
        treasury = pendingTreasuryAddress;
        emit RolesSet(council, treasury);

        changingRolesInitiated = 0;
        pendingCouncilAddress = address(0);
        pendingTreasuryAddress = address(0);
    }

    function addRecipientToWhitelist(
        address _recipient
    ) public override onlyOwner {
        require(
            !recipientsWhitelist[_recipient],
            "PCV: Recipient has already been added to whitelist"
        );
        recipientsWhitelist[_recipient] = true;
        emit RecipientAdded(_recipient);
    }

    function removeRecipientFromWhitelist(
        address _recipient
    ) public override onlyOwner {
        require(
            recipientsWhitelist[_recipient],
            "PCV: Recipient is not in whitelist"
        );
        recipientsWhitelist[_recipient] = false;
        emit RecipientRemoved(_recipient);
    }

    function depositToStabilityPool(
        uint256 _amount
    ) public onlyOwnerOrCouncilOrTreasury {
        require(
            _amount <= musd.balanceOf(address(this)),
            "PCV: not enough tokens"
        );
        require(
            musd.approve(borrowerOperations.stabilityPoolAddress(), _amount),
            "PCV: Approval failed"
        );

        IStabilityPool(borrowerOperations.stabilityPoolAddress()).provideToSP(
            _amount
        );

        // slither-disable-next-line reentrancy-events
        emit PCVDepositSP(msg.sender, _amount);
    }

    function withdrawFromStabilityPool(
        uint256 _amount
    ) public onlyOwnerOrCouncilOrTreasury {
        uint256 collateralBefore = address(this).balance;
        uint256 musdBefore = musd.balanceOf(address(this));

        IStabilityPool(borrowerOperations.stabilityPoolAddress())
            .withdrawFromSP(_amount);

        uint256 collateralChange = address(this).balance - collateralBefore;
        uint256 musdChange = musd.balanceOf(address(this)) - musdBefore;

        _repayDebt(musdChange);

        // slither-disable-next-line reentrancy-events
        emit PCVWithdrawSP(msg.sender, musdChange, collateralChange);
    }

    function _repayDebt(uint _repayment) internal {
        if (_repayment > debtToPay) {
            _repayment = debtToPay;
        }

        if (_repayment > 0 && debtToPay > 0) {
            debtToPay -= _repayment;
            borrowerOperations.burnDebtFromPCV(_repayment);

            // slither-disable-next-line reentrancy-events
            emit PCVDebtPayment(_repayment);
        }
    }
}
