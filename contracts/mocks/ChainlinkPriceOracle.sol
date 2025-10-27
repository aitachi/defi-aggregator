// SPDX-License-Identifier: MIT
pragma solidity ^0.8.22;

import "@openzeppelin/contracts/access/Ownable.sol";

contract ChainlinkPriceOracle is Ownable {
    struct PriceFeed {
        address feed;
        uint256 heartbeat;
        uint256 lastUpdate;
    }

    mapping(address => PriceFeed) public priceFeeds;

    event PriceFeedAdded(address indexed token, address feed, uint256 heartbeat);

    constructor() Ownable(msg.sender) {}

    function addPriceFeed(
        address token,
        address feed,
        uint256 heartbeat
    ) external onlyOwner {
        priceFeeds[token] = PriceFeed({
            feed: feed,
            heartbeat: heartbeat,
            lastUpdate: block.timestamp
        });

        emit PriceFeedAdded(token, feed, heartbeat);
    }

    function getPrice(address token) external view returns (uint256) {
        // Mock实现: 返回固定价格
        if (priceFeeds[token].feed != address(0)) {
            return 2000e8; // $2000 (8位小数)
        }
        return 1e8; // $1
    }
}