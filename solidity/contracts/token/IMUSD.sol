// SPDX-License-Identifier: MIT

pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/IERC20Permit.sol";

interface IMUSD is IERC20Metadata, IERC20Permit {
    // --- Events ---
    event BorrowerOperationsAddressAdded(address _newBorrowerOperationsAddress);
    event MUSDBalanceUpdated(address _user, uint256 _amount);
    event StabilityPoolAddressAdded(address _newStabilityPoolAddress);
    event TroveManagerAddressAdded(address _troveManagerAddress);

    // --- Governance Functions ---
    function cancelAddContracts() external;

    function cancelAddMintList() external;

    function cancelRevokeBurnList() external;

    function cancelRevokeMintList() external;

    function startAddContracts(
        address _troveManagerAddress,
        address _stabilityPoolAddress,
        address _borrowerOperationsAddress
    ) external;

    function startAddMintList(address _account) external;

    function startRevokeBurnList(address _account) external;

    function startRevokeMintList(address _account) external;

    function finalizeAddContracts() external;

    function finalizeAddMintList() external;

    function finalizeRevokeBurnList() external;

    function finalizeRevokeMintList() external;

    // --- External Functions ---
    function burn(address _account, uint256 _amount) external;

    function mint(address _account, uint256 _amount) external;

    function burnList(address contractAddress) external view returns (bool);

    function mintList(address contractAddress) external view returns (bool);
}
