// SPDX-License-Identifier: MIT

pragma solidity ^0.8.24;

import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/cryptography/EIP712Upgradeable.sol";
import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import "./dependencies/CheckContract.sol";
import "./interfaces/IBorrowerOperations.sol";

contract BorrowerOperationsSignatures is
    CheckContract,
    EIP712Upgradeable,
    OwnableUpgradeable
{
    using ECDSA for bytes32;

    struct AddColl {
        uint256 assetAmount;
        address upperHint;
        address lowerHint;
        address borrower;
        uint256 nonce;
        uint256 deadline;
    }

    struct OpenTrove {
        uint256 maxFeePercentage;
        uint256 debtAmount;
        uint256 assetAmount;
        address upperHint;
        address lowerHint;
        address borrower;
        uint256 nonce;
        uint256 deadline;
    }

    struct WithdrawColl {
        uint256 amount;
        address upperHint;
        address lowerHint;
        address borrower;
        uint256 nonce;
        uint256 deadline;
    }

    struct RepayMUSD {
        uint256 amount;
        address upperHint;
        address lowerHint;
        address borrower;
        uint256 nonce;
        uint256 deadline;
    }

    struct WithdrawMUSD {
        uint256 maxFeePercentage;
        uint256 amount;
        address upperHint;
        address lowerHint;
        address borrower;
        uint256 nonce;
        uint256 deadline;
    }

    struct AdjustTrove {
        uint256 maxFeePercentage;
        uint256 collWithdrawal;
        uint256 debtChange;
        bool isDebtIncrease;
        uint256 assetAmount;
        address upperHint;
        address lowerHint;
        address borrower;
        uint256 nonce;
        uint256 deadline;
    }

    struct CloseTrove {
        address borrower;
        uint256 nonce;
        uint256 deadline;
    }

    string private constant SIGNING_DOMAIN = "BorrowerOperationsSignatures";
    string private constant SIGNATURE_VERSION = "1";

    bytes32 private constant OPEN_TROVE_TYPEHASH =
        keccak256(
            "OpenTrove(uint256 maxFeePercentage,uint256 debtAmount,uint256 assetAmount,address upperHint,address lowerHint,address borrower,uint256 nonce,uint256 deadline)"
        );

    bytes32 private constant ADD_COLL_TYPEHASH =
        keccak256(
            "AddColl(uint256 assetAmount,address upperHint,address lowerHint,address borrower,uint256 nonce,uint256 deadline)"
        );

    bytes32 private constant WITHDRAW_COLL_TYPEHASH =
        keccak256(
            "WithdrawColl(uint256 amount,address upperHint,address lowerHint,address borrower,uint256 nonce,uint256 deadline)"
        );

    bytes32 private constant REPAY_MUSD_TYPEHASH =
        keccak256(
            "RepayMUSD(uint256 amount,address upperHint,address lowerHint,address borrower,uint256 nonce,uint256 deadline)"
        );

    bytes32 private constant WITHDRAW_MUSD_TYPEHASH =
        keccak256(
            "WithdrawMUSD(uint256 maxFeePercentage,uint256 amount,address upperHint,address lowerHint,address borrower,uint256 nonce,uint256 deadline)"
        );

    bytes32 private constant ADJUST_TROVE_TYPEHASH =
        keccak256(
            "AdjustTrove(uint256 maxFeePercentage,uint256 collWithdrawal,uint256 debtChange,bool isDebtIncrease,uint256 assetAmount,address upperHint,address lowerHint,address borrower,uint256 nonce,uint256 deadline)"
        );

    bytes32 private constant CLOSE_TROVE_TYPEHASH =
        keccak256(
            "CloseTrove(address borrower,uint256 nonce,uint256 deadline)"
        );

    mapping(address => uint256) private nonces;
    IBorrowerOperations private borrowerOperations;

    event BorrowerOperationsAddressChanged(
        address _newBorrowerOperationsAddress
    );

    function initialize() external initializer {
        __Ownable_init(msg.sender);
        __EIP712_init_unchained(SIGNING_DOMAIN, SIGNATURE_VERSION);
    }

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    function setAddresses(
        address _borrowerOperationsAddress
    ) external onlyOwner {
        checkContract(_borrowerOperationsAddress);

        // slither-disable-start missing-zero-check
        borrowerOperations = IBorrowerOperations(_borrowerOperationsAddress);
        // slither-disable-end missing-zero-check

        emit BorrowerOperationsAddressChanged(_borrowerOperationsAddress);

        renounceOwnership();
    }

    function addCollWithSignature(
        uint256 _assetAmount,
        address _upperHint,
        address _lowerHint,
        address _borrower,
        bytes memory _signature,
        uint256 _deadline
    ) external payable {
        // solhint-disable not-rely-on-time
        require(block.timestamp <= _deadline, "Signature expired");
        uint256 nonce = nonces[_borrower];
        AddColl memory addCollData = AddColl({
            assetAmount: _assetAmount,
            upperHint: _upperHint,
            lowerHint: _lowerHint,
            borrower: _borrower,
            nonce: nonce,
            deadline: _deadline
        });

        bytes32 digest = _hashTypedDataV4(
            keccak256(
                abi.encode(
                    ADD_COLL_TYPEHASH,
                    addCollData.assetAmount,
                    addCollData.upperHint,
                    addCollData.lowerHint,
                    addCollData.borrower,
                    addCollData.nonce,
                    addCollData.deadline
                )
            )
        );

        address recoveredAddress = ECDSA.recover(digest, _signature);
        require(
            recoveredAddress == _borrower,
            "BorrowerOperationsSignatures: Invalid signature"
        );

        nonces[_borrower]++;

        borrowerOperations.restrictedAddColl{value: msg.value}(
            addCollData.borrower,
            addCollData.assetAmount,
            addCollData.upperHint,
            addCollData.lowerHint
        );
    }

    function closeTroveWithSignature(
        address _borrower,
        bytes memory _signature,
        uint256 _deadline
    ) external {
        // solhint-disable not-rely-on-time
        require(block.timestamp <= _deadline, "Signature expired");
        uint256 nonce = nonces[_borrower];
        CloseTrove memory closeTroveData = CloseTrove({
            borrower: _borrower,
            nonce: nonce,
            deadline: _deadline
        });

        bytes32 digest = _hashTypedDataV4(
            keccak256(
                abi.encode(
                    CLOSE_TROVE_TYPEHASH,
                    closeTroveData.borrower,
                    closeTroveData.nonce,
                    closeTroveData.deadline
                )
            )
        );

        address recoveredAddress = ECDSA.recover(digest, _signature);
        require(
            recoveredAddress == _borrower,
            "BorrowerOperationsSignatures: Invalid signature"
        );

        nonces[_borrower]++;

        borrowerOperations.restrictedCloseTrove(_borrower);
    }

    function adjustTroveWithSignature(
        uint256 _maxFeePercentage,
        uint256 _collWithdrawal,
        uint256 _debtChange,
        bool _isDebtIncrease,
        uint256 _assetAmount,
        address _upperHint,
        address _lowerHint,
        address _borrower,
        bytes memory _signature,
        uint256 _deadline
    ) external payable {
        // solhint-disable not-rely-on-time
        require(block.timestamp <= _deadline, "Signature expired");
        uint256 nonce = nonces[_borrower];
        AdjustTrove memory adjustTroveData = AdjustTrove({
            maxFeePercentage: _maxFeePercentage,
            collWithdrawal: _collWithdrawal,
            debtChange: _debtChange,
            isDebtIncrease: _isDebtIncrease,
            assetAmount: _assetAmount,
            upperHint: _upperHint,
            lowerHint: _lowerHint,
            borrower: _borrower,
            nonce: nonce,
            deadline: _deadline
        });

        bytes32 digest = _hashTypedDataV4(
            keccak256(
                abi.encode(
                    ADJUST_TROVE_TYPEHASH,
                    adjustTroveData.maxFeePercentage,
                    adjustTroveData.collWithdrawal,
                    adjustTroveData.debtChange,
                    adjustTroveData.isDebtIncrease,
                    adjustTroveData.assetAmount,
                    adjustTroveData.upperHint,
                    adjustTroveData.lowerHint,
                    adjustTroveData.borrower,
                    adjustTroveData.nonce,
                    adjustTroveData.deadline
                )
            )
        );

        address recoveredAddress = ECDSA.recover(digest, _signature);
        require(
            recoveredAddress == _borrower,
            "BorrowerOperationsSignatures: Invalid signature"
        );

        nonces[_borrower]++;

        _assetAmount = msg.value;
        borrowerOperations.restrictedAdjustTrove(
            adjustTroveData.borrower,
            adjustTroveData.collWithdrawal,
            adjustTroveData.debtChange,
            adjustTroveData.isDebtIncrease,
            adjustTroveData.assetAmount,
            adjustTroveData.upperHint,
            adjustTroveData.lowerHint,
            adjustTroveData.maxFeePercentage,
            true
        );
    }

    function withdrawCollWithSignature(
        uint256 _amount,
        address _upperHint,
        address _lowerHint,
        address _borrower,
        bytes memory _signature,
        uint256 _deadline
    ) external {
        // solhint-disable not-rely-on-time
        require(block.timestamp <= _deadline, "Signature expired");
        uint256 nonce = nonces[_borrower];
        WithdrawColl memory withdrawCollData = WithdrawColl({
            amount: _amount,
            upperHint: _upperHint,
            lowerHint: _lowerHint,
            borrower: _borrower,
            nonce: nonce,
            deadline: _deadline
        });

        bytes32 digest = _hashTypedDataV4(
            keccak256(
                abi.encode(
                    WITHDRAW_COLL_TYPEHASH,
                    withdrawCollData.amount,
                    withdrawCollData.upperHint,
                    withdrawCollData.lowerHint,
                    withdrawCollData.borrower,
                    withdrawCollData.nonce,
                    withdrawCollData.deadline
                )
            )
        );

        address recoveredAddress = ECDSA.recover(digest, _signature);
        require(
            recoveredAddress == _borrower,
            "BorrowerOperationsSignatures: Invalid signature"
        );

        nonces[_borrower]++;

        borrowerOperations.restrictedWithdrawColl(
            withdrawCollData.borrower,
            withdrawCollData.amount,
            withdrawCollData.upperHint,
            withdrawCollData.lowerHint
        );
    }

    function openTroveWithSignature(
        uint256 _maxFeePercentage,
        uint256 _debtAmount,
        uint256 _assetAmount,
        address _upperHint,
        address _lowerHint,
        address _borrower,
        bytes memory _signature,
        uint256 _deadline
    ) external payable {
        // solhint-disable not-rely-on-time
        require(block.timestamp <= _deadline, "Signature expired");
        uint256 nonce = nonces[_borrower];
        OpenTrove memory openTroveData = OpenTrove({
            maxFeePercentage: _maxFeePercentage,
            debtAmount: _debtAmount,
            assetAmount: _assetAmount,
            upperHint: _upperHint,
            lowerHint: _lowerHint,
            borrower: _borrower,
            nonce: nonce,
            deadline: _deadline
        });

        bytes32 digest = _hashTypedDataV4(
            keccak256(
                abi.encode(
                    OPEN_TROVE_TYPEHASH,
                    openTroveData.maxFeePercentage,
                    openTroveData.debtAmount,
                    openTroveData.assetAmount,
                    openTroveData.upperHint,
                    openTroveData.lowerHint,
                    openTroveData.borrower,
                    openTroveData.nonce,
                    openTroveData.deadline
                )
            )
        );

        address recoveredAddress = ECDSA.recover(digest, _signature);
        require(
            recoveredAddress == _borrower,
            "BorrowerOperationsSignatures: Invalid signature"
        );

        nonces[_borrower]++;

        borrowerOperations.restrictedOpenTrove{value: msg.value}(
            openTroveData.borrower,
            openTroveData.maxFeePercentage,
            openTroveData.debtAmount,
            openTroveData.assetAmount,
            openTroveData.upperHint,
            openTroveData.lowerHint
        );
    }

    function withdrawMUSDWithSignature(
        uint256 _maxFeePercentage,
        uint256 _amount,
        address _upperHint,
        address _lowerHint,
        address _borrower,
        bytes memory _signature,
        uint256 _deadline
    ) external {
        // solhint-disable not-rely-on-time
        require(block.timestamp <= _deadline, "Signature expired");
        uint256 nonce = nonces[_borrower];
        WithdrawMUSD memory withdrawMUSDData = WithdrawMUSD({
            maxFeePercentage: _maxFeePercentage,
            amount: _amount,
            upperHint: _upperHint,
            lowerHint: _lowerHint,
            borrower: _borrower,
            nonce: nonce,
            deadline: _deadline
        });

        bytes32 digest = _hashTypedDataV4(
            keccak256(
                abi.encode(
                    WITHDRAW_MUSD_TYPEHASH,
                    withdrawMUSDData.maxFeePercentage,
                    withdrawMUSDData.amount,
                    withdrawMUSDData.upperHint,
                    withdrawMUSDData.lowerHint,
                    withdrawMUSDData.borrower,
                    withdrawMUSDData.nonce,
                    withdrawMUSDData.deadline
                )
            )
        );

        address recoveredAddress = ECDSA.recover(digest, _signature);
        require(
            recoveredAddress == _borrower,
            "BorrowerOperationsSignatures: Invalid signature"
        );

        nonces[_borrower]++;

        borrowerOperations.restrictedAdjustTrove(
            withdrawMUSDData.borrower,
            0,
            withdrawMUSDData.amount,
            true,
            0,
            withdrawMUSDData.upperHint,
            withdrawMUSDData.lowerHint,
            withdrawMUSDData.maxFeePercentage,
            true
        );
    }

    function repayMUSDWithSignature(
        uint256 _amount,
        address _upperHint,
        address _lowerHint,
        address _borrower,
        bytes memory _signature,
        uint256 _deadline
    ) external {
        // solhint-disable not-rely-on-time
        require(block.timestamp <= _deadline, "Signature expired");
        uint256 nonce = nonces[_borrower];
        RepayMUSD memory repayMUSDData = RepayMUSD({
            amount: _amount,
            upperHint: _upperHint,
            lowerHint: _lowerHint,
            borrower: _borrower,
            nonce: nonce,
            deadline: _deadline
        });

        bytes32 digest = _hashTypedDataV4(
            keccak256(
                abi.encode(
                    REPAY_MUSD_TYPEHASH,
                    repayMUSDData.amount,
                    repayMUSDData.upperHint,
                    repayMUSDData.lowerHint,
                    repayMUSDData.borrower,
                    repayMUSDData.nonce,
                    repayMUSDData.deadline
                )
            )
        );

        address recoveredAddress = ECDSA.recover(digest, _signature);
        require(
            recoveredAddress == _borrower,
            "BorrowerOperationsSignatures: Invalid signature"
        );

        nonces[_borrower]++;

        borrowerOperations.restrictedAdjustTrove(
            repayMUSDData.borrower,
            0,
            repayMUSDData.amount,
            false,
            0,
            repayMUSDData.upperHint,
            repayMUSDData.lowerHint,
            0,
            true
        );
    }

    function getNonce(address user) public view returns (uint256) {
        return nonces[user];
    }
}
