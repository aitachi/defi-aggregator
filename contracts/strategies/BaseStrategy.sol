// SPDX-License-Identifier: MIT
pragma solidity ^0.8.22;

import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/PausableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

abstract contract BaseStrategy is OwnableUpgradeable, PausableUpgradeable, UUPSUpgradeable {
    address public vault;
    IERC20 public want;

    uint256 public totalDeposited;
    uint256 public lastHarvest;

    uint256 public constant FEE_DENOMINATOR = 10000;
    uint256 public performanceFee;

    event Deposited(uint256 amount);
    event Withdrawn(uint256 amount);
    event Harvested(uint256 profit);

    modifier onlyVault() {
        require(msg.sender == vault, "Not vault");
        _;
    }

    function __BaseStrategy_init(
        address _vault,
        address _want
    ) internal onlyInitializing {
        __Ownable_init(msg.sender);
        __Pausable_init();
        __UUPSUpgradeable_init();

        vault = _vault;
        want = IERC20(_want);
        performanceFee = 1000; // 10% default performance fee
    }

    function deposit(uint256 amount)
    external
    virtual
    onlyVault
    whenNotPaused
    {
        require(amount > 0, "Cannot deposit 0");

        want.transferFrom(vault, address(this), amount);
        totalDeposited += amount;

        _deposit(amount);

        emit Deposited(amount);
    }

    function withdraw(uint256 amount)
    external
    virtual
    onlyVault
    returns (uint256)
    {
        require(amount > 0, "Cannot withdraw 0");
        require(amount <= totalDeposited, "Insufficient balance");

        uint256 withdrawn = _withdraw(amount);
        totalDeposited -= withdrawn;

        want.transfer(vault, withdrawn);

        emit Withdrawn(withdrawn);
        return withdrawn;
    }

    function harvest() external virtual returns (uint256 profit) {
        profit = _harvest();
        lastHarvest = block.timestamp;

        if (profit > 0) {
            uint256 fee = (profit * performanceFee) / FEE_DENOMINATOR;
            want.transfer(vault, profit - fee);
        }

        emit Harvested(profit);
    }

    function totalAssets() external view virtual returns (uint256) {
        return _totalAssets();
    }

    function estimatedAPY() external view virtual returns (uint256);

    function _deposit(uint256 amount) internal virtual;
    function _withdraw(uint256 amount) internal virtual returns (uint256);
    function _harvest() internal virtual returns (uint256);
    function _totalAssets() internal view virtual returns (uint256);

    function setPerformanceFee(uint256 _fee) external onlyOwner {
        require(_fee <= 2000, "Fee too high");
        performanceFee = _fee;
    }

    function pause() external onlyOwner {
        _pause();
    }

    function unpause() external onlyOwner {
        _unpause();
    }

    function emergencyWithdraw() external onlyOwner {
        uint256 total = _totalAssets();
        _withdraw(total);
        want.transfer(vault, want.balanceOf(address(this)));
    }

    function _authorizeUpgrade(address newImplementation) internal override onlyOwner {}

    uint256[42] private __gap;
}