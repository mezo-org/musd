// SPDX-License-Identifier: MIT

pragma solidity 0.8.24;

import "../TroveManager.sol";
import "./ITroveManagerFuzzTester.sol";

contract TroveManagerFuzzTester is TroveManager, ITroveManagerFuzzTester {
    // solhint-disable-next-line func-name-mixedcase
    function getLastCollateralError_Redistribution()
        external
        view
        returns (uint256)
    {
        return lastCollateralError_Redistribution;
    }

    // solhint-disable-next-line func-name-mixedcase
    function getLastPrincipalError_Redistribution()
        external
        view
        returns (uint256)
    {
        return lastPrincipalError_Redistribution;
    }

    // solhint-disable-next-line func-name-mixedcase
    function getLastInterestError_Redistribution()
        external
        view
        returns (uint256)
    {
        return lastInterestError_Redistribution;
    }

    function viewGetEntireSystemColl() external view returns (uint256) {
        return getEntireSystemColl();
    }

    function viewGetEntireSystemDebt() external view returns (uint256) {
        return getEntireSystemDebt();
    }
}
