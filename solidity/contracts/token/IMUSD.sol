// SPDX-License-Identifier: GPL-3.0

pragma solidity 0.8.24;

import "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/IERC20Permit.sol";

interface IMUSD is IERC20Metadata, IERC20Permit {
    event BorrowerOperationsAddressAdded(address newBorrowerOperationsAddress);
    event InterestRateManagerAddressAdded(address interestRateManagerAddress);
    event StabilityPoolAddressAdded(address newStabilityPoolAddress);
    event TroveManagerAddressAdded(address troveManagerAddress);
    event MintListAddressAdded(address _address);
    event MintListAddressRemoved(address _address);
    event BurnListAddressAdded(address _address);
    event BurnListAddressRemoved(address _address);

    error AddressHasMintRole();
    error AddressHasBurnRole();
    error AddressWithoutMintRole();
    error AddressWithoutBurnRole();

    function burn(address _account, uint256 _amount) external;
    function mint(address _account, uint256 _amount) external;
    function burnList(address contractAddress) external view returns (bool);
    function mintList(address contractAddress) external view returns (bool);
}
