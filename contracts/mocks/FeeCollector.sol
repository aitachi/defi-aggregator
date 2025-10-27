// SPDX-License-Identifier: MIT
pragma solidity ^0.8.22;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

contract FeeCollector is Ownable {
    address public treasury;
    uint256 public performanceFeeBps;
    uint256 public managementFeeBps;

    event FeeCollected(address token, uint256 amount);

    constructor(
        address _treasury,
        uint256 _performanceFeeBps,
        uint256 _managementFeeBps
    ) Ownable(msg.sender) {
        treasury = _treasury;
        performanceFeeBps = _performanceFeeBps;
        managementFeeBps = _managementFeeBps;
    }

    function collectFee(address token, uint256 amount) external {
        IERC20(token).transferFrom(msg.sender, treasury, amount);
        emit FeeCollected(token, amount);
    }
}