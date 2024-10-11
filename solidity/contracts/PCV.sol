// SPDX-License-Identifier: MIT

pragma solidity ^0.8.24;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "./dependencies/CheckContract.sol";
import "./dependencies/SendCollateral.sol";
import "./token/IMUSD.sol";
import "./interfaces/IPCV.sol";
import "./BorrowerOperations.sol";

contract PCV is IPCV, Ownable, CheckContract, SendCollateral {
    uint256 public constant BOOTSTRAP_LOAN = 1e26; // 100M MUSD

    uint256 public immutable governanceTimeDelay;

    IMUSD public musd;
    IERC20 public collateralERC20;
    BorrowerOperations public borrowerOperations;

    // TODO ideal initialization in constructor/setAddresses
    uint256 public debtToPay;
    bool public isInitialized;

    address public council;
    address public treasury;

    mapping(address => bool) public recipientsWhitelist;

    address public pendingCouncilAddress;
    address public pendingTreasuryAddress;
    uint256 public changingRolesInitiated;

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

    constructor(uint256 _governanceTimeDelay) Ownable(msg.sender) {
        governanceTimeDelay = _governanceTimeDelay;
        require(governanceTimeDelay <= 30 weeks, "Governance delay is too big");
    }

    receive() external payable {
        require(
            address(collateralERC20) == address(0),
            "PCV: ERC20 collateral needed, not BTC"
        );
    }

    function payDebt(
        uint256 _musdToBurn
    ) external override onlyOwnerOrCouncilOrTreasury {
        require(debtToPay > 0, "PCV: debt has already paid");
        require(
            _musdToBurn <= musd.balanceOf(address(this)),
            "PCV: not enough tokens"
        );
        uint256 musdToBurn = LiquityMath._min(_musdToBurn, debtToPay);
        debtToPay -= musdToBurn;

        borrowerOperations.burnDebtFromPCV(musdToBurn);
        // slither-disable-next-line reentrancy-events
        emit PCVDebtPaid(musdToBurn);
    }

    function setAddresses(
        address _musdTokenAddress,
        address _borrowerOperations,
        address _collateralERC20
    ) external override onlyOwner {
        require(address(musd) == address(0), "PCV: contacts already set");
        checkContract(_musdTokenAddress);
        checkContract(_borrowerOperations);
        if (_collateralERC20 != address(0)) {
            checkContract(_collateralERC20);
        }

        musd = IMUSD(_musdTokenAddress);
        collateralERC20 = IERC20(_collateralERC20);
        borrowerOperations = BorrowerOperations(_borrowerOperations);

        require(
            (Ownable(_borrowerOperations).owner() != address(0) ||
                borrowerOperations.collateralAddress() == _collateralERC20),
            "The same collateral address must be used for the entire set of contracts"
        );

        emit MUSDTokenAddressSet(_musdTokenAddress);
        emit BorrowerOperationsAddressSet(_borrowerOperations);
        emit CollateralAddressSet(_collateralERC20);
    }

    function initialize() external override onlyOwnerOrCouncilOrTreasury {
        require(!isInitialized, "PCV: already initialized");

        debtToPay = BOOTSTRAP_LOAN;
        isInitialized = true;
        borrowerOperations.mintBootstrapLoanFromPCV(BOOTSTRAP_LOAN);
        depositToStabilityPool(BOOTSTRAP_LOAN);
    }

    function withdrawMUSD(
        address _recipient,
        uint256 _musdAmount
    )
        external
        override
        onlyAfterDebtPaid
        onlyOwnerOrCouncilOrTreasury
        onlyWhitelistedRecipient(_recipient)
    {
        require(
            _musdAmount <= musd.balanceOf(address(this)),
            "PCV: not enough tokens"
        );
        require(
            musd.transfer(_recipient, _musdAmount),
            "PCV: sending MUSD failed"
        );
        // slither-disable-next-line reentrancy-events
        emit MUSDWithdraw(_recipient, _musdAmount);
    }

    function withdrawCollateral(
        address _recipient,
        uint256 _collateralAmount
    )
        external
        override
        onlyAfterDebtPaid
        onlyOwnerOrCouncilOrTreasury
        onlyWhitelistedRecipient(_recipient)
    {
        sendCollateral(collateralERC20, _recipient, _collateralAmount);

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
        uint256 _musdAmount
    ) public onlyOwnerOrCouncilOrTreasury {
        require(
            _musdAmount <= musd.balanceOf(address(this)),
            "PCV: not enough tokens"
        );
        require(
            musd.approve(
                borrowerOperations.stabilityPoolAddress(),
                _musdAmount
            ),
            "PCV: Approval failed"
        );
        IStabilityPool(borrowerOperations.stabilityPoolAddress()).provideToSP(
            _musdAmount
        );

        // TODO Emit event
    }
}
