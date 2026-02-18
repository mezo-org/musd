// SPDX-License-Identifier: GPL-3.0

pragma solidity 0.8.24;

import "@openzeppelin/contracts-upgradeable/access/Ownable2StepUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/ReentrancyGuardUpgradeable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

import "../dependencies/CheckContract.sol";
import "./SendCollateralERC20.sol";
import "../interfaces/erc20/IPCVERC20.sol";
import "../interfaces/erc20/IBorrowerOperationsERC20.sol";
import "../interfaces/erc20/IStabilityPoolERC20.sol";
import "../token/IMUSD.sol";
import "../interfaces/IMUSDSavingsRate.sol";
import "../interfaces/ICollateralFeeRecipient.sol";

/// @title Protocol Controlled Value for ERC20 Collateral
/// @notice The contract receives all interest and fees from the system and is
///         in charge of the bootstrap loan deposited to the stability pool.
///         The fees and interest are used to pay back the bootstrap loan or
///         deposited to the stability pool, as well as distributed to Tigris
///         as yield, depending on yield split parameters set by governance.
contract PCVERC20 is
    CheckContract,
    IPCVERC20,
    Ownable2StepUpgradeable,
    ReentrancyGuardUpgradeable,
    SendCollateralERC20
{
    using SafeERC20 for IMUSD;
    using SafeERC20 for IERC20;

    uint256 public constant BOOTSTRAP_LOAN = 1e26; // 100M mUSD

    uint256 public governanceTimeDelay;

    address public collateralToken;
    IBorrowerOperationsERC20 public borrowerOperations;
    IMUSD public musd;

    uint256 public debtToPay;
    bool public isInitialized;

    address public council;
    address public treasury;

    mapping(address => bool) public recipientsWhitelist;

    address public pendingCouncilAddress;
    address public pendingTreasuryAddress;
    uint256 public changingRolesInitiated;

    /// @dev MUSD fee recipient. Must implement IMUSDSavingsRate.
    address public feeRecipient;
    /// @dev Percentage of MUSD fees to be sent to feeRecipient. This split does
    ///      not apply to collateral fees.
    uint8 public feeSplitPercentage;
    uint8 public constant PERCENT_MAX = 100;

    /// @dev Collateral redemption fees recipient. Must implement ICollateralFeeRecipient.
    address public collateralRecipient;

    modifier onlyOwnerOrCouncilOrTreasury() {
        require(
            msg.sender == owner() ||
                msg.sender == council ||
                msg.sender == treasury,
            "PCVERC20: caller must be owner or council or treasury"
        );
        _;
    }

    modifier onlyWhitelistedRecipient(address _recipient) {
        require(
            recipientsWhitelist[_recipient],
            "PCVERC20: recipient must be in whitelist"
        );
        _;
    }

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    function initialize(uint256 _governanceTimeDelay) external initializer {
        __Ownable_init(msg.sender);

        require(
            _governanceTimeDelay <= 30 weeks,
            "PCVERC20: Governance delay is too big"
        );
        governanceTimeDelay = _governanceTimeDelay;
    }

    function initializeV2() external reinitializer(2) {
        __ReentrancyGuard_init();
    }

    function setAddresses(
        address _collateralToken,
        address _borrowerOperations,
        address _musdTokenAddress
    ) external override onlyOwner {
        require(address(musd) == address(0), "PCVERC20: contacts already set");

        checkContract(_collateralToken);
        checkContract(_borrowerOperations);
        checkContract(_musdTokenAddress);

        // slither-disable-start missing-zero-check
        collateralToken = _collateralToken;
        borrowerOperations = IBorrowerOperationsERC20(_borrowerOperations);
        musd = IMUSD(_musdTokenAddress);
        // slither-disable-end missing-zero-check

        emit CollateralTokenAddressSet(_collateralToken);
        emit BorrowerOperationsAddressSet(_borrowerOperations);
        emit MUSDTokenAddressSet(_musdTokenAddress);
    }

    function initializeDebt() external override onlyOwnerOrCouncilOrTreasury {
        revert("PCVERC20: not implemented");
    }

    function setFeeRecipient(
        address _feeRecipient
    ) external onlyOwnerOrCouncilOrTreasury {
        require(
            _feeRecipient != address(0),
            "PCVERC20: Recipient cannot be the zero address."
        );
        feeRecipient = _feeRecipient;
        emit FeeRecipientSet(_feeRecipient);
    }

    function setCollateralRecipient(
        address _collateralRecipient
    ) external onlyOwnerOrCouncilOrTreasury {
        require(
            _collateralRecipient != address(0),
            "PCVERC20: Collateral recipient cannot be the zero address."
        );
        collateralRecipient = _collateralRecipient;
        emit CollateralRecipientSet(_collateralRecipient);
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
            "PCVERC20: must set fee recipient before setFeeSplit"
        );
        require(
            _feeSplitPercentage <= PERCENT_MAX,
            "PCVERC20: Fee split must be at most 100"
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
            "PCVERC20: these roles already set"
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
        require(
            changingRolesInitiated != 0,
            "PCVERC20: Change not initiated"
        );

        changingRolesInitiated = 0;
        pendingCouncilAddress = address(0);
        pendingTreasuryAddress = address(0);
    }

    function finalizeChangingRoles() external override onlyOwner {
        require(
            changingRolesInitiated > 0,
            "PCVERC20: Change not initiated"
        );
        require(
            // solhint-disable-next-line not-rely-on-time
            block.timestamp >= changingRolesInitiated + governanceTimeDelay,
            "PCVERC20: Governance delay has not elapsed"
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
    ) external override onlyOwner {
        require(
            !recipientsWhitelist[_recipient],
            "PCVERC20: Recipient has already been added to whitelist"
        );
        recipientsWhitelist[_recipient] = true;
        emit RecipientAdded(_recipient);
    }

    function removeRecipientFromWhitelist(
        address _recipient
    ) external override onlyOwner {
        require(
            recipientsWhitelist[_recipient],
            "PCVERC20: Recipient is not in whitelist"
        );
        recipientsWhitelist[_recipient] = false;
        emit RecipientRemoved(_recipient);
    }

    /// @notice Distributes MUSD fees accumulated in this contract. The MUSD
    ///         comes from the borrowing fee, interest on debt, and refinance
    ///         fee. The fees are distributed based on the governance yield
    ///         split parameters. A portion of fees can be used to repay the
    ///         bootstrap loan or deposit to the stability pool. Another portion
    ///         of fees can be sent to Tigris as yield.
    function distributeMUSD() external override nonReentrant {
        uint256 musdBalance = musd.balanceOf(address(this));
        // If there are not enough tokens to distribute, do nothing.
        // This approach is less descriptive but more bot-friendly, which in the case
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
            _depositToStabilityPool(stabilityPoolDeposit);
        }

        if (feeRecipient != address(0) && distributedFees > 0) {
            musd.forceApprove(feeRecipient, distributedFees);
            IMUSDSavingsRate(feeRecipient).receiveProtocolYield(
                distributedFees
            );

            // slither-disable-next-line reentrancy-events
            emit PCVDistribution(feeRecipient, distributedFees);
        }
    }

    /// @notice Distributes accumulated collateral from redemption fees to Tigris as
    ///         yield.
    function distributeCollateral() external override nonReentrant {
        uint256 collateralAmount = IERC20(collateralToken).balanceOf(
            address(this)
        );
        // If there is not enough collateral to distribute, do nothing.
        // This approach is less descriptive but more bot-friendly, which in the case
        // of this function is more appropriate.
        if (collateralAmount == 0) {
            return;
        }

        require(
            collateralRecipient != address(0),
            "PCVERC20: Collateral recipient not set"
        );

        _sendCollateral(collateralToken, collateralRecipient, collateralAmount);
        ICollateralFeeRecipient(collateralRecipient)
            .receiveProtocolYieldInCollateral(collateralAmount);
        // slither-disable-next-line reentrancy-events
        emit PCVDistributionCollateral(collateralRecipient, collateralAmount);
    }

    /// @notice Allows anyone to deposit MUSD to the stability pool. Note that
    ///         the tokens will be deposited as a PCV deposit, so the depositor
    ///         is donating them to the PCV. Do not call this function unless
    ///         you want to donate your tokens!
    function depositToStabilityPool(uint256 _amount) external {
        musd.safeTransferFrom(msg.sender, address(this), _amount);
        _depositToStabilityPool(_amount);
    }

    /// @notice Withdraws collateral and/or MUSD from the stability pool to the
    ///         provided recipient address. The recipient address must have been
    ///         whitelisted beforehand. The function is used for rebalancing the
    ///         stability pool after liquidations.
    function withdrawFromStabilityPool(
        uint256 _amount,
        address _recipient
    )
        external
        onlyOwnerOrCouncilOrTreasury
        onlyWhitelistedRecipient(_recipient)
    {
        revert("PCVERC20: not implemented");
    }

    function _repayDebt(uint _repayment) internal returns (uint256) {
        revert("PCVERC20: not implemented");
    }

    function _depositToStabilityPool(uint256 _amount) internal {
        revert("PCVERC20: not implemented");
    }
}
