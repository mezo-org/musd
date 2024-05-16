// SPDX-License-Identifier: MIT

pragma solidity ^0.8.17;

import "@openzeppelin/contracts/access/Ownable.sol";
import "./dependencies/CheckContract.sol";
import "./interfaces/ISortedTroves.sol";

/*
 * A sorted doubly linked list with nodes sorted in descending order.
 *
 * Nodes map to active Troves in the system - the ID property is the address of a Trove owner.
 * Nodes are ordered according to their current nominal individual collateral ratio (NICR),
 * which is like the ICR but without the price, i.e., just collateral / debt.
 *
 * The list optionally accepts insert position hints.
 *
 * NICRs are computed dynamically at runtime, and not stored on the Node. This is because NICRs of active Troves
 * change dynamically as liquidation events occur.
 *
 * The list relies on the fact that liquidation events preserve ordering: a liquidation decreases the NICRs of all active Troves,
 * but maintains their order. A node inserted based on current NICR will maintain the correct position,
 * relative to it's peers, as rewards accumulate, as long as it's raw collateral and debt have not changed.
 * Thus, Nodes remain sorted by current NICR.
 *
 * Nodes need only be re-inserted upon a Trove operation - when the owner adds or removes collateral or debt
 * to their position.
 *
 * The list is a modification of the following audited SortedDoublyLinkedList:
 * https://github.com/livepeer/protocol/blob/master/contracts/libraries/SortedDoublyLL.sol
 *
 *
 * Changes made in the Liquity implementation:
 *
 * - Keys have been removed from nodes
 *
 * - Ordering checks for insertion are performed by comparing an NICR argument to the current NICR, calculated at runtime.
 *   The list relies on the property that ordering by ICR is maintained as the collateral:USD price varies.
 *
 * - Public functions with parameters have been made internal to save gas, and given an external wrapper function for external access
 */
contract SortedTroves is Ownable, CheckContract, ISortedTroves {
    constructor() Ownable(msg.sender) {}

    function setParams(
        uint256 _size,
        address _TroveManagerAddress,
        address _borrowerOperationsAddress
    ) external override {}

    function insert(
        address _id,
        uint256 _ICR,
        address _prevId,
        address _nextId
    ) external override {}

    function remove(address _id) external override {}

    function reInsert(
        address _id,
        uint256 _newICR,
        address _prevId,
        address _nextId
    ) external override {}

    function contains(address _id) external view override returns (bool) {}

    function isFull() external view override returns (bool) {}

    function isEmpty() external view override returns (bool) {}

    function getSize() external view override returns (uint256) {}

    function getMaxSize() external view override returns (uint256) {}

    function getFirst() external view override returns (address) {}

    function getLast() external view override returns (address) {}

    function getNext(address _id) external view override returns (address) {}

    function getPrev(address _id) external view override returns (address) {}

    function validInsertPosition(
        uint256 _ICR,
        address _prevId,
        address _nextId
    ) external view override returns (bool) {}

    function findInsertPosition(
        uint256 _ICR,
        address _prevId,
        address _nextId
    ) external view override returns (address, address) {}
}
