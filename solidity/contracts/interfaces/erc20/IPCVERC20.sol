// SPDX-License-Identifier: MIT

pragma solidity 0.8.24;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "../../token/IMUSD.sol";

/// @title IPCVERC20
/// @notice Interface for Protocol Controlled Value with ERC20 collateral support
/// @dev This is the ERC20 version of IPCV, replacing native token handling with ERC20
interface IPCVERC20 {
    // --- Events ---
    event BorrowerOperationsAddressSet(address _borrowerOperationsAddress);
    event MUSDTokenAddressSet(address _musdTokenAddress);
    event CollateralTokenAddressSet(address _collateralTokenAddress);
    event StabilityPoolAddressSet(address _stabilityPoolAddress);
    event RolesSet(address _council, address _treasury);

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
    event CollateralReceived(address indexed from, uint256 amount);

    // --- Functions ---

    /// @notice Returns the outstanding bootstrap loan debt
    function debtToPay() external view returns (uint256);

    /// @notice Returns the collateral token
    function collateralToken() external view returns (IERC20);

    /// @notice Distributes MUSD fees accumulated in this contract
    /// @dev The fees are distributed based on governance yield split parameters
    function distributeMUSD() external;

    /// @notice Distributes accumulated ERC20 collateral from redemption fees
    function distributeCollateral() external;

    /// @notice Receives ERC20 collateral
    /// @param _amount The amount of collateral to receive
    function receiveCollateral(uint256 _amount) external;

    /// @notice Sets the addresses of connected contracts
    /// @param _borrowerOperations Address of BorrowerOperationsERC20
    /// @param _musdTokenAddress Address of MUSD token
    /// @param _collateralTokenAddress Address of ERC20 collateral token
    /// @param _stabilityPoolAddress Address of StabilityPoolERC20
    function setAddresses(
        address _borrowerOperations,
        address _musdTokenAddress,
        address _collateralTokenAddress,
        address _stabilityPoolAddress
    ) external;

    /// @notice Initializes the bootstrap loan debt
    function initializeDebt() external;

    /// @notice Sets the MUSD fee recipient
    /// @param _feeRecipient Address of the fee recipient
    function setFeeRecipient(address _feeRecipient) external;

    /// @notice Sets the collateral fee recipient
    /// @param _collateralRecipient Address of the collateral fee recipient
    function setCollateralRecipient(address _collateralRecipient) external;

    /// @notice Sets the fee split percentage
    /// @param _feeSplitPercentage Percentage of fees to send to fee recipient (0-100)
    function setFeeSplit(uint8 _feeSplitPercentage) external;

    /// @notice Adds an address to the recipient whitelist
    /// @param _recipient Address to add
    function addRecipientToWhitelist(address _recipient) external;

    /// @notice Removes an address from the recipient whitelist
    /// @param _recipient Address to remove
    function removeRecipientFromWhitelist(address _recipient) external;

    /// @notice Starts the process of changing council and treasury roles
    /// @param _council New council address
    /// @param _treasury New treasury address
    function startChangingRoles(address _council, address _treasury) external;

    /// @notice Cancels the pending role change
    function cancelChangingRoles() external;

    /// @notice Finalizes the role change after governance delay
    function finalizeChangingRoles() external;

    /// @notice Allows anyone to deposit MUSD to the stability pool (donated to PCV)
    /// @param _amount Amount of MUSD to deposit
    function depositToStabilityPool(uint256 _amount) external;

    /// @notice Withdraws from stability pool to whitelisted recipient
    /// @param _amount Amount to withdraw
    /// @param _recipient Whitelisted recipient address
    function withdrawFromStabilityPool(
        uint256 _amount,
        address _recipient
    ) external;

    /// @notice Returns the MUSD token
    function musd() external view returns (IMUSD);

    /// @notice Returns the council address
    function council() external view returns (address);

    /// @notice Returns the treasury address
    function treasury() external view returns (address);
}
