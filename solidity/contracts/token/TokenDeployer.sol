// SPDX-License-Identifier: GPL-3.0

pragma solidity 0.8.24;

import "./MUSD.sol";

/// @title MUSD Token Deployer
/// @notice TokenDeployer allows the governance to deploy MUSD token to the
///         chain using a stable address. The TokenDeployer should be deployed
///         to the chain using the EIP2470 singleton factory.
contract TokenDeployer {
    bytes32 public constant SALT =
        keccak256("Bank on yourself. Bring everyday finance to your Bitcoin.");

    /// @notice The deployer address allowed to call the `deploy()` function.
    /// @dev This is the same deployer EOA as the one used to deploy all tBTC v1,
    ///      tBTC v2, and Mezo contracts across various networks.
    address public constant DEPLOYER =
        0x123694886DBf5Ac94DDA07135349534536D14cAf;

    /// @notice The governance address receiving the control over the token;
    /// @dev This is the same multisig as the one used to control Mezo contracts
    ///      upgradeability and some protocol parameters of the chain.
    address public constant GOVERNANCE =
        0x98D8899c3030741925BE630C710A98B57F397C7a;

    uint256 public constant MEZO_CHAIN_ID = 31612;
    uint256 public constant ETHEREUM_CHAIN_ID = 1;
    uint256 public constant MATSNET_TESTNET_CHAIN_ID = 31611;

    /// @notice The address of the deployed MUSD token contract.
    /// @dev Zero address before the contract is deployed.
    address public token;

    event TokenDeployed(address token);

    error Create2Failed();
    error NotDeployer();
    error NotGovernance();

    /// @notice Deploys the MUSD token to the chain via create2 and initializes
    ///         it with the provided system contract addresses and governance
    ///         delay.
    function deployToken(
        address _troveManagerAddress,
        address _stabilityPoolAddress,
        address _borrowerOperationsAddress,
        address _interestRateManagerAddress,
        address _reversibleCallOptionManagerAddress
    ) external {
        if (
            block.chainid == MEZO_CHAIN_ID || block.chainid == ETHEREUM_CHAIN_ID
        ) {
            if (msg.sender != DEPLOYER) {
                revert NotDeployer();
            }
        } else if (block.chainid == MATSNET_TESTNET_CHAIN_ID) {
            // Allow any deployer on matsnet testnet for testing purposes
        } else {
            if (msg.sender != GOVERNANCE) {
                revert NotGovernance();
            }
        }

        // Slither detector yields false positive, it is a bug in Slither.
        // https://github.com/crytic/slither/issues/1223
        // slither-disable-next-line too-many-digits
        token = _deploy(type(MUSD).creationCode);
        emit TokenDeployed(token);

        MUSD(token).initialize(
            _troveManagerAddress,
            _stabilityPoolAddress,
            _borrowerOperationsAddress,
            _interestRateManagerAddress,
            _reversibleCallOptionManagerAddress
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
