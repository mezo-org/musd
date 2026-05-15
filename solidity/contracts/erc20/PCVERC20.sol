// SPDX-License-Identifier: GPL-3.0

pragma solidity 0.8.24;

import "@openzeppelin/contracts-upgradeable/access/Ownable2StepUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/ReentrancyGuardUpgradeable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

import "../dependencies/CheckContract.sol";
import "../interfaces/erc20/IPCVERC20.sol";
import "../interfaces/erc20/IStabilityPoolERC20.sol";
import "../interfaces/erc20/IBorrowerOperationsPCV.sol";
import "../interfaces/IMUSDSavingsRate.sol";
import "../token/IMUSD.sol";

/**
 * @title PCVERC20
 * @notice Protocol Controlled Value for ERC20 collateral
 *
 * The contract receives all interest and fees from the system and is
 * in charge of the bootstrap loan deposited to the stability pool.
 * The fees and interest are used to pay back the bootstrap loan or
 * deposited to the stability pool, as well as distributed to yield
 * recipients, depending on yield split parameters set by governance.
 *
 * This ERC20 version handles ERC20 tokens as collateral instead of native ETH.
 */
contract PCVERC20 is
    CheckContract,
    IPCVERC20,
    Ownable2StepUpgradeable,
    ReentrancyGuardUpgradeable
{
    using SafeERC20 for IMUSD;
    using SafeERC20 for IERC20;

    uint256 public constant BOOTSTRAP_LOAN = 1e26; // 100M mUSD

    uint256 public governanceTimeDelay;

    IBorrowerOperationsPCV public borrowerOperations;
    IMUSD public musd;
    IStabilityPoolERC20 public stabilityPool;
    IERC20 public collateralToken;

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

    /// @dev ERC20 collateral fees recipient.
    address public collateralRecipient;

    /// @dev Collateral balance tracked internally
    uint256 internal collateral;

    error CollateralTransferFailed();

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

    function initialize(
        address _collateralToken,
        uint256 _governanceTimeDelay
    ) external initializer {
        require(_collateralToken != address(0), "Invalid collateral token");
        __Ownable_init(msg.sender);
        __ReentrancyGuard_init();

        require(
            _governanceTimeDelay <= 30 weeks,
            "Governance delay is too big"
        );

        collateralToken = IERC20(_collateralToken);
        governanceTimeDelay = _governanceTimeDelay;
    }

    function setAddresses(
        address _borrowerOperations,
        address _musdTokenAddress,
        address _stabilityPoolAddress
    ) external override onlyOwner {
        require(address(musd) == address(0), "PCVERC20: contracts already set");

        checkContract(_borrowerOperations);
        checkContract(_musdTokenAddress);
        checkContract(_stabilityPoolAddress);

        // slither-disable-start missing-zero-check
        borrowerOperations = IBorrowerOperationsPCV(_borrowerOperations);
        musd = IMUSD(_musdTokenAddress);
        stabilityPool = IStabilityPoolERC20(_stabilityPoolAddress);
        // slither-disable-end missing-zero-check

        emit BorrowerOperationsAddressSet(_borrowerOperations);
        emit MUSDTokenAddressSet(_musdTokenAddress);
        emit StabilityPoolAddressSet(_stabilityPoolAddress);
    }

    /**
     * @notice Receives ERC20 collateral from callers
     * @param _amount Amount of collateral to receive
     * @dev Pulls tokens via transferFrom from caller
     */
    function receiveCollateral(uint256 _amount) external override {
        if (_amount == 0) return;
        _pullCollateral(msg.sender, _amount);
        collateral += _amount;
        emit CollateralReceived(msg.sender, _amount);
    }

    function initializeDebt() external override onlyOwnerOrCouncilOrTreasury {
        require(!isInitialized, "PCVERC20: already initialized");

        debtToPay = BOOTSTRAP_LOAN;
        isInitialized = true;
        borrowerOperations.mintBootstrapLoanFromPCV(BOOTSTRAP_LOAN);
        _depositToStabilityPool(BOOTSTRAP_LOAN);
    }

    function setFeeRecipient(
        address _feeRecipient
    ) external override onlyOwnerOrCouncilOrTreasury {
        require(
            _feeRecipient != address(0),
            "PCVERC20: Recipient cannot be the zero address."
        );
        feeRecipient = _feeRecipient;
        emit FeeRecipientSet(_feeRecipient);
    }

    function setCollateralRecipient(
        address _collateralRecipient
    ) external override onlyOwnerOrCouncilOrTreasury {
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
    ) external override onlyOwnerOrCouncilOrTreasury {
        require(
            feeRecipient != address(0),
            "PCVERC20 must set fee recipient before setFeeSplit"
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
        require(changingRolesInitiated != 0, "PCVERC20: Change not initiated");

        changingRolesInitiated = 0;
        pendingCouncilAddress = address(0);
        pendingTreasuryAddress = address(0);
    }

    function finalizeChangingRoles() external override onlyOwner {
        require(changingRolesInitiated > 0, "PCVERC20: Change not initiated");
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
    ///         of fees can be sent to the fee recipient as yield.
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

    /// @notice Distributes accumulated ERC20 collateral from redemption fees
    ///         to the collateral recipient as yield.
    function distributeCollateral() external override nonReentrant {
        uint256 collateralAmount = collateral;
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

        collateral = 0;
        _sendCollateral(collateralRecipient, collateralAmount);

        // slither-disable-next-line reentrancy-events
        emit PCVDistributionCollateral(collateralRecipient, collateralAmount);
    }

    /// @notice Allows anyone to deposit MUSD to the stability pool. Note that
    ///         the tokens will be deposited as a PCV deposit, so the depositor
    ///         is donating them to the PCV. Do not call this function unless
    ///         you want to donate your tokens!
    function depositToStabilityPool(uint256 _amount) external override {
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
        override
        onlyOwnerOrCouncilOrTreasury
        onlyWhitelistedRecipient(_recipient)
    {
        uint256 collateralBefore = collateral;
        uint256 musdBefore = musd.balanceOf(address(this));

        stabilityPool.withdrawFromSP(_amount);

        // Note: For ERC20, we need to check the actual token balance change
        // since StabilityPoolERC20 sends collateral directly via transfer
        uint256 collateralChange = collateralToken.balanceOf(address(this)) -
            (collateralBefore > 0 ? collateralBefore : 0);
        // Update internal tracking if we received collateral
        if (collateralChange > 0) {
            collateral += collateralChange;
        }

        uint256 musdChange = musd.balanceOf(address(this)) - musdBefore;

        uint256 debtRepayment = _repayDebt(musdChange);
        uint256 excessMusd = musdChange - debtRepayment;

        // Send collateral to recipient
        if (collateralChange > 0) {
            collateral -= collateralChange;
            _sendCollateral(_recipient, collateralChange);
        }

        // Send excess MUSD to recipient (after debt repayment)
        if (excessMusd > 0) {
            musd.safeTransfer(_recipient, excessMusd);
        }

        // slither-disable-next-line reentrancy-events
        emit PCVWithdrawSP(msg.sender, musdChange, collateralChange);
    }

    // --- View functions ---

    /**
     * @notice Returns the collateral balance held by PCV
     */
    function getCollateralBalance() external view override returns (uint256) {
        return collateral;
    }

    // --- Internal functions ---

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

    function _depositToStabilityPool(uint256 _amount) internal {
        musd.forceApprove(address(stabilityPool), _amount);

        stabilityPool.provideToSP(_amount);

        // slither-disable-next-line reentrancy-events
        emit PCVDepositSP(msg.sender, _amount);
    }

    function _sendCollateral(address _recipient, uint256 _amount) internal {
        if (_amount == 0) return;
        bool success = collateralToken.transfer(_recipient, _amount);
        if (!success) revert CollateralTransferFailed();
    }

    function _pullCollateral(address _from, uint256 _amount) internal {
        if (_amount == 0) return;
        bool success = collateralToken.transferFrom(
            _from,
            address(this),
            _amount
        );
        if (!success) revert CollateralTransferFailed();
    }
}
