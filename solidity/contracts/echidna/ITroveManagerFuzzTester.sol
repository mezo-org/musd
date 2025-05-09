// SPDX-License-Identifier: MIT

pragma solidity 0.8.24;

import "../interfaces/ITroveManager.sol";

interface ITroveManagerFuzzTester is ITroveManager {
    function viewGetEntireSystemColl() external view returns (uint256);

    function viewGetEntireSystemDebt() external view returns (uint256);

    // solhint-disable-next-line func-name-mixedcase
    function getLastCollateralError_Redistribution()
        external
        view
        returns (uint256);

    // solhint-disable-next-line func-name-mixedcase
    function getLastPrincipalError_Redistribution()
        external
        view
        returns (uint256);

    // solhint-disable-next-line func-name-mixedcase
    function getLastInterestError_Redistribution()
        external
        view
        returns (uint256);
}
