// SPDX-License-Identifier: GPL-3.0

pragma solidity 0.8.24;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "../../token/IMUSD.sol";
import "./IStabilityPoolERC20.sol";

/**
 * @title IPCVERC20
 * @notice Interface for Protocol Controlled Value with ERC20 collateral
 *
 * The PCV (Protocol Controlled Value) contract receives all interest and fees
 * from the system and manages fee distribution. This ERC20 version handles
 * ERC20 tokens as collateral instead of native ETH.
 */
interface IPCVERC20 {
    // --- Events ---

    event BorrowerOperationsAddressSet(address _borrowerOperationsAddress);
    event MUSDTokenAddressSet(address _musdTokenAddress);
    event StabilityPoolAddressSet(address _stabilityPoolAddress);
    event RolesSet(address _council, address _treasury);

    event CollateralReceived(address indexed _from, uint256 _amount);
    event CollateralWithdraw(address _recipient, uint256 _collateralAmount);
    event CollateralRecipientSet(address _collateralRecipient);
    event FeeRecipientSet(address _feeRecipient);
    event FeeSplitSet(uint8 _feeSplitPercentage);
    event MUSDWithdraw(address _recipient, uint256 _amount);
    event PCVDebtPayment(uint256 _paidDebt);
    event PCVDepositSP(address indexed user, uint256 musdAmount);
    event PCVDistribution(address _recipient, uint256 _amount);
    event PCVDistributionCollateral(address _recipient, uint256 _amount);
    event PCVWithdrawSP(
        address indexed user,
        uint256 musdAmount,
        uint256 collateralAmount
    );
    event RecipientAdded(address _recipient);
    event RecipientRemoved(address _recipient);

    // --- External Functions ---

    /**
     * @notice Distributes accumulated MUSD fees
     * @dev Distributes based on feeSplitPercentage and debtToPay
     */
    function distributeMUSD() external;

    /**
     * @notice Distributes accumulated ERC20 collateral from redemption fees
     * @dev Sends collateral to the configured collateralRecipient
     */
    function distributeCollateral() external;

    /**
     * @notice Sets the addresses of other protocol contracts
     * @param _borrowerOperations Address of BorrowerOperations contract
     * @param _musdTokenAddress Address of MUSD token contract
     * @param _stabilityPoolAddress Address of StabilityPool contract
     */
    function setAddresses(
        address _borrowerOperations,
        address _musdTokenAddress,
        address _stabilityPoolAddress
    ) external;

    /**
     * @notice Initializes the bootstrap debt
     */
    function initializeDebt() external;

    /**
     * @notice Receives ERC20 collateral from callers
     * @param _amount Amount of collateral to receive
     * @dev Pulls tokens via transferFrom from caller
     */
    function receiveCollateral(uint256 _amount) external;

    /**
     * @notice Sets the MUSD fee recipient address
     * @param _feeRecipient Address to receive MUSD fees
     */
    function setFeeRecipient(address _feeRecipient) external;

    /**
     * @notice Sets the collateral fee recipient address
     * @param _collateralRecipient Address to receive collateral fees
     */
    function setCollateralRecipient(address _collateralRecipient) external;

    /**
     * @notice Sets the fee split percentage
     * @param _feeSplitPercentage Percentage of fees to send to feeRecipient (0-100)
     */
    function setFeeSplit(uint8 _feeSplitPercentage) external;

    /**
     * @notice Adds an address to the recipients whitelist
     * @param _recipient Address to add
     */
    function addRecipientToWhitelist(address _recipient) external;

    /**
     * @notice Removes an address from the recipients whitelist
     * @param _recipient Address to remove
     */
    function removeRecipientFromWhitelist(address _recipient) external;

    /**
     * @notice Starts the process of changing council and treasury roles
     * @param _council New council address
     * @param _treasury New treasury address
     */
    function startChangingRoles(address _council, address _treasury) external;

    /**
     * @notice Cancels a pending role change
     */
    function cancelChangingRoles() external;

    /**
     * @notice Finalizes a pending role change after governance delay
     */
    function finalizeChangingRoles() external;

    /**
     * @notice Deposits MUSD to the stability pool
     * @param _amount Amount of MUSD to deposit
     */
    function depositToStabilityPool(uint256 _amount) external;

    /**
     * @notice Withdraws from the stability pool to a whitelisted recipient
     * @param _amount Amount to withdraw
     * @param _recipient Whitelisted recipient address
     */
    function withdrawFromStabilityPool(
        uint256 _amount,
        address _recipient
    ) external;

    // --- View Functions ---

    /**
     * @notice Returns the outstanding debt to repay
     */
    function debtToPay() external view returns (uint256);

    /**
     * @notice Returns the MUSD token contract
     */
    function musd() external view returns (IMUSD);

    /**
     * @notice Returns the collateral token contract
     */
    function collateralToken() external view returns (IERC20);

    /**
     * @notice Returns the council address
     */
    function council() external view returns (address);

    /**
     * @notice Returns the treasury address
     */
    function treasury() external view returns (address);

    /**
     * @notice Returns the collateral balance held by PCV
     */
    function getCollateralBalance() external view returns (uint256);
}
