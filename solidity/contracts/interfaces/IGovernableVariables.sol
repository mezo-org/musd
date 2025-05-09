// SPDX-License-Identifier: MIT

pragma solidity 0.8.24;

interface IGovernableVariables {
    event FeeExemptAccountAdded(address _account);
    event FeeExemptAccountRemoved(address _account);
    event RolesSet(address _council, address _treasury);

    function addFeeExemptAccount(address _account) external;

    function addFeeExemptAccounts(address[] calldata _accounts) external;

    function removeFeeExemptAccounts(address[] calldata _accounts) external;

    function removeFeeExemptAccount(address _account) external;

    function startChangingRoles(address _council, address _treasury) external;

    function cancelChangingRoles() external;

    function finalizeChangingRoles() external;

    function isAccountFeeExempt(address _account) external view returns (bool);

    function council() external view returns (address);

    function treasury() external view returns (address);
}
