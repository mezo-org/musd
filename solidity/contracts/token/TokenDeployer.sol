// SPDX-License-Identifier: MIT

pragma solidity ^0.8.24;

import "./MUSD.sol";

/// @title MUSD Token Deployer
/// @notice TokenDeployer allows the governance to deploy MUSD token to the
///         chain using a stable address. The TokenDeployer should be deployed
///         to the chain using the EIP2470 singleton factory.
contract TokenDeployer {
    bytes32 public constant SALT =
        keccak256("Bank on yourself. Bring everyday finance to your Bitcoin.");

    /// @notice The governance address eligible for token deployment.
    address public constant GOVERNANCE =
        0x98D8899c3030741925BE630C710A98B57F397C7a;

    /// @notice The address of the deployed MUSD token contract.
    /// @dev Zero address before the contract is deployed.
    address public token;

    event TokenDeployed(address token);

    error Create2Failed();
    error NotGovernance();

    /// @notice Deploys the MUSD token to the chain via create2 and initializes
    ///         it with the provided system contract addresses and governance
    ///         delay.
    function deploy(
        address _troveManagerAddress,
        address _stabilityPoolAddress,
        address _borrowerOperationsAddress,
        address _interestRateManagerAddress,
        uint256 _governanceTimeDelay
    ) external {
        if (msg.sender != GOVERNANCE) {
            revert NotGovernance();
        }

        token = _deploy(abi.encodePacked(type(MUSD).creationCode));
        emit TokenDeployed(token);

        MUSD(token).initialize(
            _troveManagerAddress,
            _stabilityPoolAddress,
            _borrowerOperationsAddress,
            _interestRateManagerAddress,
            _governanceTimeDelay
        );

        MUSD(token).transferOwnership(GOVERNANCE);
    }

    /// @dev Deploys a contract with CREATE2.
    /// @param deploymentData Encoded deployment data.
    /// @return deployedContract Address of the deployed contract.
    function _deploy(
        bytes memory deploymentData
    ) internal returns (address deployedContract) {
        bytes32 salt = SALT;
        // solhint-disable-next-line no-inline-assembly
        assembly {
            deployedContract := create2(
                0x0,
                add(0x20, deploymentData),
                mload(deploymentData),
                salt
            )
        }
        if (address(deployedContract) == address(0)) {
            revert Create2Failed();
        }
    }
}
