// SPDX-License-Identifier: MIT

pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/IERC20Permit.sol";

interface IMUSD is IERC20Metadata, IERC20Permit {
    // --- Events ---
    event BorrowerOperationsAddressAdded(address _newBorrowerOperationsAddress);
    event BalanceUpdated(address _user, uint256 _amount);
    event InterestRateManagerAddressAdded(address _interestRateManagerAddress);
    event StabilityPoolAddressAdded(address _newStabilityPoolAddress);
    event TroveManagerAddressAdded(address _troveManagerAddress);

    function initialize(
        address _troveManagerAddress,
        address _stabilityPoolAddress,
        address _borrowerOperationsAddress,
        address _interestRateManagerAddress,
        uint256 _governanceTimeDelay
    ) external;

    // --- Governance Functions ---

    function cancelAddContracts() external;

    function cancelAddMintList() external;

    function cancelRevokeBurnList() external;

    function cancelRevokeMintList() external;

    function startAddContracts(
        address _troveManagerAddress,
        address _stabilityPoolAddress,
        address _borrowerOperationsAddress,
        address _interestRateManagerAddress
    ) external;

    function startAddMintList(address[] calldata _accounts) external;

    function startRevokeBurnList(address[] calldata _accounts) external;

    function startRevokeMintList(address[] calldata _accounts) external;

    function finalizeAddContracts() external;

    function finalizeAddMintList() external;

    function finalizeRevokeBurnList() external;

    function finalizeRevokeMintList() external;

    function burn(address _account, uint256 _amount) external;

    function mint(address _account, uint256 _amount) external;

    function burnList(address contractAddress) external view returns (bool);

    function mintList(address contractAddress) external view returns (bool);
}
