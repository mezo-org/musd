// SPDX-License-Identifier: MIT

pragma solidity ^0.8.24;

import "./BorrowerOperationsState.sol";
import "./interfaces/IPriceFeed.sol";
import "./interfaces/ITroveManager.sol";

library BorrowerOperationsTroves {
    event RefinancingFeePaid(address indexed _borrower, uint256 _fee);

    function refinance(
        BorrowerOperationsState.Storage storage self,
        IPriceFeed priceFeed,
        uint256 _maxFeePercentage
    ) external {
        ITroveManager troveManagerCached = self.troveManager;
        IInterestRateManager interestRateManagerCached = self
            .interestRateManager;
        _requireTroveisActive(troveManagerCached, msg.sender);
        troveManagerCached.updateSystemAndTroveInterest(msg.sender);

        uint16 oldRate = troveManagerCached.getTroveInterestRate(msg.sender);
        uint256 oldInterest = troveManagerCached.getTroveInterestOwed(
            msg.sender
        );
        uint256 oldDebt = troveManagerCached.getTroveDebt(msg.sender);
        uint256 amount = (self.refinancingFeePercentage * oldDebt) / 100;
        uint256 fee = _triggerBorrowingFee(
            self,
            troveManagerCached,
            self.musd,
            amount,
            _maxFeePercentage
        );
        // slither-disable-next-line unused-return
        troveManagerCached.increaseTroveDebt(msg.sender, fee);

        uint256 oldPrincipal = troveManagerCached.getTrovePrincipal(msg.sender);

        interestRateManagerCached.removeInterestFromRate(oldRate, oldInterest);
        interestRateManagerCached.removePrincipalFromRate(
            oldRate,
            oldPrincipal
        );
        uint16 newRate = interestRateManagerCached.interestRate();
        interestRateManagerCached.addInterestToRate(newRate, oldInterest);
        interestRateManagerCached.addPrincipalToRate(newRate, oldPrincipal);

        troveManagerCached.setTroveInterestRate(
            msg.sender,
            interestRateManagerCached.interestRate()
        );

        uint256 maxBorrowingCapacity = _calculateMaxBorrowingCapacity(
            troveManagerCached.getTroveColl(msg.sender),
            priceFeed.fetchPrice()
        );
        troveManagerCached.setTroveMaxBorrowingCapacity(
            msg.sender,
            maxBorrowingCapacity
        );

        // slither-disable-next-line reentrancy-events
        emit RefinancingFeePaid(msg.sender, fee);
    }

    //
    // TODO: THE CODE BELOW IS DUPLICATED; GROUP IT TOGETHER PROPERLY OR
    //       EXTRACT SO THAT WE DON'T CTRL+C & CTRL+V BETWEEN
    //       LIBRARIES AND THE MAIN CONTRACT.
    //

    uint256 public constant DECIMAL_PRECISION = 1e18;

    function _requireTroveisActive(
        ITroveManager _troveManager,
        address _borrower
    ) internal view {
        ITroveManager.Status status = _troveManager.getTroveStatus(_borrower);

        require(
            status == ITroveManager.Status.active,
            "BorrowerOps: Trove does not exist or is closed"
        );
    }

    function _triggerBorrowingFee(
        BorrowerOperationsState.Storage storage self,
        ITroveManager _troveManager,
        IMUSD _musd,
        uint256 _amount,
        uint256 _maxFeePercentage
    ) internal returns (uint) {
        _troveManager.decayBaseRateFromBorrowing(); // decay the baseRate state variable
        uint256 fee = _troveManager.getBorrowingFee(_amount);

        _requireUserAcceptsFee(fee, _amount, _maxFeePercentage);

        // Send fee to PCV contract
        _musd.mint(self.pcvAddress, fee);
        return fee;
    }

    function _requireUserAcceptsFee(
        uint256 _fee,
        uint256 _amount,
        uint256 _maxFeePercentage
    ) internal pure {
        uint256 feePercentage = (_fee * DECIMAL_PRECISION) / _amount;
        require(
            feePercentage <= _maxFeePercentage,
            "Fee exceeded provided maximum"
        );
    }

    function _calculateMaxBorrowingCapacity(
        uint256 _coll,
        uint256 _price
    ) internal pure returns (uint) {
        return (_coll * _price) / (110 * 1e16);
    }

    //
    // TODO: THE CODE ABOVE IS DUPLICATED; GROUP IT TOGETHER PROPERLY OR
    //       EXTRACT SO THAT WE DON'T CTRL+C & CTRL+V BETWEEN
    //       LIBRARIES AND THE MAIN CONTRACT.
    //
}
