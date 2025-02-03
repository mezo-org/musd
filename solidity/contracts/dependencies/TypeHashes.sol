library TypeHashes {
    function getOpenTroveTypeHash() external returns (bytes32) {
        return
            keccak256(
                "OpenTrove(uint256 maxFeePercentage,uint256 debtAmount,uint256 assetAmount,address upperHint,address lowerHint,address borrower,uint256 nonce,uint256 deadline)"
            );
    }

    function getOpenTroveTypehash() external returns (bytes32) {
        return
            keccak256(
                "OpenTrove(uint256 maxFeePercentage,uint256 debtAmount,uint256 assetAmount,address upperHint,address lowerHint,address borrower,uint256 nonce,uint256 deadline)"
            );
    }

    function getRepayMUSDTypehash() external returns (bytes32) {
        return
            keccak256(
                "RepayMUSD(uint256 amount,address upperHint,address lowerHint,address borrower,uint256 nonce,uint256 deadline)"
            );
    }

    function getAddCollTypehash() external returns (bytes32) {
        return
            keccak256(
                "AddColl(uint256 assetAmount,address upperHint,address lowerHint,address borrower,uint256 nonce,uint256 deadline)"
            );
    }

    function getWithdrawCollTypehash() external returns (bytes32) {
        return
            keccak256(
                "WithdrawColl(uint256 amount,address upperHint,address lowerHint,address borrower,uint256 nonce,uint256 deadline)"
            );
    }

    function getWithdrawMUSDTypehash() external returns (bytes32) {
        return
            keccak256(
                "WithdrawMUSD(uint256 maxFeePercentage,uint256 amount,address upperHint,address lowerHint,address borrower,uint256 nonce,uint256 deadline)"
            );
    }

    function getAdjustTroveTypehash() external returns (bytes32) {
        return
            keccak256(
                "AdjustTrove(uint256 maxFeePercentage,uint256 collWithdrawal,uint256 debtChange,bool isDebtIncrease,uint256 assetAmount,address upperHint,address lowerHint,address borrower,uint256 nonce,uint256 deadline)"
            );
    }

    function getCloseTroveTypehash() external returns (bytes32) {
        return
            keccak256(
                "CloseTrove(address borrower,uint256 nonce,uint256 deadline)"
            );
    }
}
