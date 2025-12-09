// SPDX-License-Identifier: GPL-3.0

pragma solidity 0.8.24;

import "@openzeppelin/contracts-upgradeable/access/Ownable2StepUpgradeable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

import "./BorrowerOperations.sol";
import "./dependencies/CheckContract.sol";
import "./dependencies/SendCollateral.sol";
import "./interfaces/IPCV.sol";
import "./token/IMUSD.sol";
import "./interfaces/IMUSDSavingsRate.sol";
import "./interfaces/IBTCFeeRecipient.sol";

contract PCV is CheckContract, IPCV, Ownable2StepUpgradeable, SendCollateral {
    using SafeERC20 for IERC20;

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

    address public feeRecipient; // MUSD savings rate address
    uint8 public feeSplitPercentage; // percentage of fees to be sent to feeRecipient
    uint8 public constant PERCENT_MAX = 100;

    address public btcRecipient; // Tigris BTC to MUSD converter address

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
            "PCV: Recipient cannot be the zero address."
        );
        feeRecipient = _feeRecipient;
        emit FeeRecipientSet(_feeRecipient);
    }

    function setBTCRecipient(
        address _btcRecipient
    ) external onlyOwnerOrCouncilOrTreasury {
        require(
            _btcRecipient != address(0),
            "PCV: BTC recipient cannot be the zero address."
        );
        btcRecipient = _btcRecipient;
        emit BTCRecipientSet(_btcRecipient);
    }

    /// @notice Set the fee split percentage
    /// @param _feeSplitPercentage The fee split percentage
    /// @dev The fee split percentage must be between 0 and 100,
    ///      where 0 means all fees are sent for the protocol loan repayment and
    ///      100 means all fees are sent to the fee recipient.
    function setFeeSplit(
        uint8 _feeSplitPercentage
    ) external onlyOwnerOrCouncilOrTreasury {
        require(
            feeRecipient != address(0),
            "PCV must set fee recipient before setFeeSplit"
        );
        require(
            _feeSplitPercentage <= PERCENT_MAX,
            "PCV: Fee split must be at most 100"
        );
        feeSplitPercentage = _feeSplitPercentage;

        emit FeeSplitSet(_feeSplitPercentage);
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

    function distributeMUSD() external override onlyOwnerOrCouncilOrTreasury {
        uint256 musdBalance = musd.balanceOf(address(this));
        // If there are not enough tokens to distribute, do nothing.
        // This approach is less descriptive but more bot friendly which in case
        // of this function is more appropriate.
        if (musdBalance == 0) {
            return;
        }

        uint256 distributedFees = (musdBalance * feeSplitPercentage) /
            PERCENT_MAX;
        uint256 protocolLoanRepayment = musdBalance - distributedFees;
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

        if (feeRecipient != address(0) && distributedFees > 0) {
            require(
                musd.approve(feeRecipient, distributedFees),
                "PCV: feeRecipient approval failed"
            );
            IMUSDSavingsRate(feeRecipient).receiveProtocolYield(
                distributedFees
            );

            // slither-disable-next-line reentrancy-events
            emit PCVDistribution(feeRecipient, distributedFees);
        }
    }

    function distributeBTC() external override onlyOwnerOrCouncilOrTreasury {
        uint256 collateralAmount = address(this).balance;
        // If there are not enough collateral to distribute, do nothing.
        // This approach is less descriptive but more bot friendly which in case
        // of this function is more appropriate.
        if (collateralAmount == 0) {
            return;
        }

        require(btcRecipient != address(0), "PCV: BTC recipient not set");

        _sendCollateral(btcRecipient, collateralAmount);
        IBTCFeeRecipient(btcRecipient).receiveProtocolYieldInBTC(
            collateralAmount
        );
        // slither-disable-next-line reentrancy-events
        emit PCVDistributionBTC(btcRecipient, collateralAmount);
    }

    function withdrawMUSD(
        address _recipient,
        uint256 _amount
    )
        external
        override
        onlyOwnerOrCouncilOrTreasury
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

    function withdrawBTC(
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
        uint256 _amount,
        address _recipient
    ) public onlyOwnerOrCouncilOrTreasury onlyWhitelistedRecipient(_recipient) {
        uint256 collateralBefore = address(this).balance;
        uint256 musdBefore = musd.balanceOf(address(this));

        IStabilityPool(borrowerOperations.stabilityPoolAddress())
            .withdrawFromSP(_amount);

        uint256 collateralChange = address(this).balance - collateralBefore;
        uint256 musdChange = musd.balanceOf(address(this)) - musdBefore;

        uint256 debtRepayment = _repayDebt(musdChange);
        uint256 excessMusd = musdChange - debtRepayment;

        // Send BTC collateral to recipient
        if (collateralChange > 0) {
            _sendCollateral(_recipient, collateralChange);
        }

        // Send excess MUSD to recipient (after debt repayment)
        if (excessMusd > 0) {
            IERC20(address(musd)).safeTransfer(_recipient, excessMusd);
        }

        // slither-disable-next-line reentrancy-events
        emit PCVWithdrawSP(msg.sender, musdChange, collateralChange);
    }

    function _repayDebt(uint _repayment) internal returns (uint256) {
        if (_repayment > debtToPay) {
            _repayment = debtToPay;
        }

        if (_repayment > 0 && debtToPay > 0) {
            debtToPay -= _repayment;
            borrowerOperations.burnDebtFromPCV(_repayment);

            // slither-disable-next-line reentrancy-events
            emit PCVDebtPayment(_repayment);
            return _repayment;
        }

        return 0;
    }
}
