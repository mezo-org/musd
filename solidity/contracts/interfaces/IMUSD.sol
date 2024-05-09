// SPDX-License-Identifier: MIT

pragma solidity ^0.8.17;

import "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/IERC20Permit.sol";

interface IMUSD is IERC20Metadata, IERC20Permit {
    // --- Events ---

    event TroveManagerAddressAdded(address _troveManagerAddress);
    event StabilityPoolAddressAdded(address _newStabilityPoolAddress);
    event BorrowerOperationsAddressAdded(address _newBorrowerOperationsAddress);
    event MUSDBalanceUpdated(address _user, uint256 _amount);

    // // --- Governance functions ---
    function startRevokeMintList(address _account) external;
    function finalizeRevokeMintList() external;

    // // --- External Functions ---
    function mint(address _account, uint256 _amount) external;
    function burn(address _account, uint256 _amount) external;
    function mintList(address contractAddress) external view returns (bool);
    function burnList(address contractAddress) external view returns (bool);
}
