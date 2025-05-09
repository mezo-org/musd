// SPDX-License-Identifier: MIT

pragma solidity 0.8.24;

library LiquityMath {
    /* Precision for Nominal ICR (independent of price). Rationale for the value:
     *
     * - Making it “too high” could lead to overflows.
     * - Making it “too low” could lead to an ICR equal to zero, due to truncation from Solidity floor division.
     *
     * This value of 1e20 is chosen for safety: the NICR will only overflow for numerator > ~1e39 BTC,
     * and will only truncate to 0 if the denominator is at least 1e20 times greater than the numerator.
     *
     */
    uint256 internal constant NICR_PRECISION = 1e20;

    function _min(uint256 _a, uint256 _b) internal pure returns (uint) {
        return (_a < _b) ? _a : _b;
    }

    function _getAbsoluteDifference(
        uint256 _a,
        uint256 _b
    ) internal pure returns (uint) {
        return (_a >= _b) ? _a - _b : _b - _a;
    }

    function _computeNominalCR(
        uint256 _coll,
        uint256 _debt
    ) internal pure returns (uint) {
        if (_debt > 0) {
            return (_coll * NICR_PRECISION) / _debt;
        }
        // Return the maximal value for uint256 if the Trove has a debt of 0. Represents "infinite" CR.
        else {
            // if (_debt == 0)
            return type(uint256).max;
        }
    }

    function _computeCR(
        uint256 _coll,
        uint256 _debt,
        uint256 _price
    ) internal pure returns (uint) {
        if (_debt > 0) {
            uint256 newCollRatio = (_coll * _price) / _debt;

            return newCollRatio;
        }
        // Return the maximal value for uint256 if the Trove has a debt of 0. Represents "infinite" CR.
        else {
            // if (_debt == 0)
            return type(uint256).max;
        }
    }
}
