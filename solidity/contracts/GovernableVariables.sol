// SPDX-License-Identifier: MIT

pragma solidity ^0.8.24;

import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";

import "./interfaces/IGovernableVariables.sol";

contract GovernableVariables is IGovernableVariables, OwnableUpgradeable {
    address public council;
    address public treasury;

    uint256 public governanceTimeDelay;

    address public pendingCouncilAddress;
    address public pendingTreasuryAddress;
    uint256 public changingRolesInitiated;

    // Fee Exemption
    mapping(address => bool) public feeExemptAccounts;

    modifier onlyGovernance() {
        require(
            msg.sender == council || msg.sender == treasury,
            "GovernableVariables: Only governance can call this function"
        );
        _;
    }

    function initialize(uint256 _governanceTimeDelay) external initializer {
        __Ownable_init(msg.sender);

        require(
            _governanceTimeDelay <= 30 weeks,
            "Governance delay is too big"
        );
        governanceTimeDelay = _governanceTimeDelay;
    }

    function startChangingRoles(
        address _council,
        address _treasury
    ) external onlyOwner {
        require(
            _council != council || _treasury != treasury,
            "GovernableVariables: these roles are already set"
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

    function cancelChangingRoles() external onlyOwner {
        require(
            changingRolesInitiated != 0,
            "GovernableVariables: Change not initiated"
        );

        changingRolesInitiated = 0;
        pendingCouncilAddress = address(0);
        pendingTreasuryAddress = address(0);
    }

    function finalizeChangingRoles() external onlyOwner {
        require(
            changingRolesInitiated > 0,
            "GovernableVariables: Change not initiated"
        );
        require(
            // solhint-disable-next-line not-rely-on-time
            block.timestamp >= changingRolesInitiated + governanceTimeDelay,
            "GovernableVariables: Governance delay has not elapsed"
        );

        council = pendingCouncilAddress;
        treasury = pendingTreasuryAddress;
        emit RolesSet(council, treasury);

        changingRolesInitiated = 0;
        pendingCouncilAddress = address(0);
        pendingTreasuryAddress = address(0);
    }

    function removeFeeExemptAccounts(
        address[] calldata _accounts
    ) external onlyGovernance {
        require(
            _accounts.length > 0,
            "GovernableVariables: Fee Exempt array must not be empty"
        );
        uint accountLength = _accounts.length;
        for (uint256 i = 0; i < accountLength; i++) {
            removeFeeExemptAccount(_accounts[i]);
        }
    }

    function addFeeExemptAccounts(
        address[] calldata _accounts
    ) external onlyGovernance {
        require(
            _accounts.length > 0,
            "GovernableVariables: Fee Exempt array must not be empty."
        );
        uint accountLength = _accounts.length;
        for (uint256 i = 0; i < accountLength; i++) {
            addFeeExemptAccount(_accounts[i]);
        }
    }

    function isAccountFeeExempt(address _account) external view returns (bool) {
        return feeExemptAccounts[_account];
    }

    function addFeeExemptAccount(address _account) public onlyGovernance {
        require(
            !feeExemptAccounts[_account],
            "GovernableVariables: Account must not already be exempt."
        );

        feeExemptAccounts[_account] = true;
        emit FeeExemptAccountAdded(_account);
    }

    function removeFeeExemptAccount(address _account) public onlyGovernance {
        require(
            feeExemptAccounts[_account],
            "GovernableVariables: Account must currently be exempt."
        );

        feeExemptAccounts[_account] = false;
        emit FeeExemptAccountRemoved(_account);
    }
}
