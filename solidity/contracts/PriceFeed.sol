// SPDX-License-Identifier: MIT

pragma solidity ^0.8.24;

import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/access/Ownable2StepUpgradeable.sol";

import "./interfaces/ChainlinkAggregatorV3Interface.sol";
import "./interfaces/IPriceFeed.sol";

contract PriceFeed is IPriceFeed, Initializable, Ownable2StepUpgradeable {
    /// @dev Used to convert an oracle price answer to an 18-digit precision uint
    uint8 public constant TARGET_DIGITS = 18;

    // State ------------------------------------------------------------------------------------------------------------
    ChainlinkAggregatorV3Interface public oracle;

    // slither-disable-next-line unused-state
    uint256[50] private __gap;

    function initialize(address _owner) external virtual initializer {
        __Ownable_init_unchained(_owner);
    }

    // Admin routines ---------------------------------------------------------------------------------------------------

    function setOracle(address _oracle) external onlyOwner {
        ChainlinkAggregatorV3Interface chainLinkOracle = ChainlinkAggregatorV3Interface(
                _oracle
            );

        require(chainLinkOracle.decimals() > 0, "Invalid Decimals from Oracle");
        // slither-disable-next-line unused-return
        (, int256 price, , , ) = chainLinkOracle.latestRoundData();
        require(price != 0, "Oracle returns 0 for price");

        oracle = chainLinkOracle;
        emit NewOracleRegistered(_oracle);
    }

    // Public functions -------------------------------------------------------------------------------------------------

    function fetchPrice() public view virtual returns (uint256) {
        // slither-disable-next-line unused-return
        (, int256 price, , , ) = oracle.latestRoundData();
        return _scalePriceByDigits(uint256(price), oracle.decimals());
    }

    /**
     * @dev Scales oracle's response up/down to 1e18 precisoin.
     */
    function _scalePriceByDigits(
        uint256 _price,
        uint8 _priceDigits
    ) internal pure returns (uint256) {
        unchecked {
            if (_priceDigits > TARGET_DIGITS) {
                return _price / (10 ** (_priceDigits - TARGET_DIGITS));
            } else if (_priceDigits < TARGET_DIGITS) {
                return _price * (10 ** (TARGET_DIGITS - _priceDigits));
            }
        }
        return _price;
    }
}
