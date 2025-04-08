// SPDX-License-Identifier: MIT

pragma solidity ^0.8.24;

import "./dependencies/OwnableUpgradeable.sol";

import "./dependencies/CheckContract.sol";
import "./dependencies/InterestRateMath.sol";
import "./dependencies/LiquityBase.sol";
import "./interfaces/IBorrowerOperations.sol";
import "./interfaces/ISortedTroves.sol";
import "./interfaces/ITroveManager.sol";

contract HintHelpers is CheckContract, LiquityBase, OwnableUpgradeable {
    string public constant NAME = "HintHelpers";

    IBorrowerOperations public borrowerOperations;
    ISortedTroves public sortedTroves;
    ITroveManager public troveManager;

    // --- Events ---

    event BorrowerOperationsAddressChanged(address _borrowerOperationsAddress);
    event SortedTrovesAddressChanged(address _sortedTrovesAddress);
    event TroveManagerAddressChanged(address _troveManagerAddress);

    function initialize() external initializer {
        __Ownable_init(msg.sender);
    }

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    // --- Dependency setters ---

    function setAddresses(
        address _borrowerOperationsAddress,
        address _sortedTrovesAddress,
        address _troveManagerAddress
    ) external onlyOwner {
        checkContract(_borrowerOperationsAddress);
        checkContract(_sortedTrovesAddress);
        checkContract(_troveManagerAddress);

        borrowerOperations = IBorrowerOperations(_borrowerOperationsAddress);
        sortedTroves = ISortedTroves(_sortedTrovesAddress);
        troveManager = ITroveManager(_troveManagerAddress);

        emit BorrowerOperationsAddressChanged(_borrowerOperationsAddress);
        emit SortedTrovesAddressChanged(_sortedTrovesAddress);
        emit TroveManagerAddressChanged(_troveManagerAddress);

        renounceOwnership();
    }

    // --- Functions ---

    /* getRedemptionHints() - Helper function for finding the right hints to pass to redeemCollateral().
     *
     * It simulates a redemption of `_amount` to figure out where the redemption sequence will start and what state the final Trove
     * of the sequence will end up in.
     *
     * Returns three hints:
     *  - `firstRedemptionHint` is the address of the first Trove with ICR >= MCR (i.e. the first Trove that will be redeemed).
     *  - `partialRedemptionHintNICR` is the final nominal ICR of the last Trove of the sequence after being hit by partial redemption,
     *     or zero in case of no partial redemption.
     *  - `truncatedAmount` is the maximum amount that can be redeemed out of the the provided `_amount`. This can be lower than
     *    `_amount` when redeeming the full amount would leave the last Trove of the redemption sequence with less net debt than the
     *    minimum allowed value (i.e. minNetDebt).
     *
     * The number of Troves to consider for redemption can be capped by passing a non-zero value as `_maxIterations`, while passing zero
     * will leave it uncapped.
     */

    function getRedemptionHints(
        uint256 _amount,
        uint256 _price,
        uint256 _maxIterations
    )
        external
        view
        returns (
            address firstRedemptionHint,
            uint256 partialRedemptionHintNICR,
            uint256 truncatedAmount
        )
    {
        ISortedTroves sortedTrovesCached = sortedTroves;

        uint256 remainingMUSD = _amount;
        address currentTroveuser = sortedTrovesCached.getLast();

        // slither-disable-start calls-loop
        while (
            currentTroveuser != address(0) &&
            troveManager.getCurrentICR(currentTroveuser, _price) < MCR
        ) {
            currentTroveuser = sortedTrovesCached.getPrev(currentTroveuser);
        }

        firstRedemptionHint = currentTroveuser;

        if (_maxIterations == 0) {
            _maxIterations = type(uint256).max;
        }

        uint256 minNetDebt = borrowerOperations.minNetDebt();

        while (
            currentTroveuser != address(0) &&
            remainingMUSD > 0 &&
            _maxIterations > 0
        ) {
            _maxIterations--;

            // slither-disable-start unused-return
            (
                uint256 coll,
                uint256 principal,
                uint256 interest,
                ,
                ,

            ) = troveManager.getEntireDebtAndColl(currentTroveuser);
            // slither-disable-end unused-return

            uint256 netDebt = _getNetDebt(principal + interest);

            if (netDebt > remainingMUSD) {
                if (netDebt <= minNetDebt) {
                    break;
                }

                uint256 maxRedeemableMUSD = LiquityMath._min(
                    remainingMUSD,
                    netDebt - minNetDebt
                );

                coll -= ((maxRedeemableMUSD * DECIMAL_PRECISION) / _price);

                // slither-disable-start unused-return
                (uint256 principalAdjustment, ) = InterestRateMath
                    .calculateDebtAdjustment(interest, maxRedeemableMUSD);
                // slither-disable-end unused-return

                principal -= principalAdjustment;

                partialRedemptionHintNICR = LiquityMath._computeNominalCR(
                    coll,
                    principal
                );

                remainingMUSD -= maxRedeemableMUSD;
            } else {
                remainingMUSD -= netDebt;
            }

            currentTroveuser = sortedTrovesCached.getPrev(currentTroveuser);
        }
        // slither-disable-end calls-loop

        truncatedAmount = _amount - remainingMUSD;
    }

    /* getApproxHint() - return address of a Trove that is, on average, (length / numTrials) positions away in the
    sortedTroves list from the correct insert position of the Trove to be inserted.

    Note: The output address is worst-case O(n) positions away from the correct insert position, however, the function
    is probabilistic. Input can be tuned to guarantee results to a high degree of confidence, e.g:

    Submitting numTrials = k * sqrt(length), with k = 15 makes it very, very likely that the ouput address will
    be <= sqrt(length) positions away from the correct insert position.
    */
    function getApproxHint(
        uint256 _CR,
        uint256 _numTrials,
        uint256 _inputRandomSeed
    )
        external
        view
        returns (address hintAddress, uint256 diff, uint256 latestRandomSeed)
    {
        uint256 arrayLength = troveManager.getTroveOwnersCount();

        if (arrayLength == 0) {
            return (address(0), 0, _inputRandomSeed);
        }

        hintAddress = sortedTroves.getLast();
        diff = LiquityMath._getAbsoluteDifference(
            _CR,
            troveManager.getNominalICR(hintAddress)
        );
        latestRandomSeed = _inputRandomSeed;

        uint256 i = 1;

        // slither-disable-start calls-loop
        while (i < _numTrials) {
            latestRandomSeed = uint(
                keccak256(abi.encodePacked(latestRandomSeed))
            );

            uint256 arrayIndex = latestRandomSeed % arrayLength;
            address currentAddress = troveManager.getTroveFromTroveOwnersArray(
                arrayIndex
            );
            uint256 currentNICR = troveManager.getNominalICR(currentAddress);

            // check if abs(current - CR) > abs(closest - CR), and update closest if current is closer
            uint256 currentDiff = LiquityMath._getAbsoluteDifference(
                currentNICR,
                _CR
            );

            if (currentDiff < diff) {
                diff = currentDiff;
                hintAddress = currentAddress;
            }
            i++;
        }
        // slither-disable-end calls-loop
    }

    function computeNominalCR(
        uint256 _coll,
        uint256 _debt
    ) external pure returns (uint) {
        return LiquityMath._computeNominalCR(_coll, _debt);
    }

    function computeCR(
        uint256 _coll,
        uint256 _debt,
        uint256 _price
    ) external pure returns (uint) {
        return LiquityMath._computeCR(_coll, _debt, _price);
    }
}
