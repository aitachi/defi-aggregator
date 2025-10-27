// SPDX-License-Identifier: MIT
pragma solidity ^0.8.22;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

/**
 * @title YieldToken (YT)
 * @notice Represents the yield component of a principal-yield split
 * @dev Holders receive accumulated yield from the underlying vault
 */
contract YieldToken is ERC20, Ownable {
    using SafeERC20 for IERC20;

    // ============ State Variables ============

    address public underlyingAsset;
    address public principalToken;
    address public vault;

    uint256 public maturity;
    uint256 public totalYieldClaimed;

    // User claimed yield tracking
    mapping(address => uint256) public userYieldClaimed;

    // Accumulated yield rate (1e18 = 100%)
    uint256 public accumulatedYieldRate;
    mapping(address => uint256) public userYieldDebt;

    // ============ Events ============

    event YieldClaimed(address indexed user, uint256 amount);
    event YieldDistributed(uint256 amount);
    event PrincipalTokenSet(address indexed principalToken);
    event YieldFinalized(uint256 totalYield);

    // ============ Constructor ============

    constructor(
        string memory name,
        string memory symbol,
        address _underlyingAsset,
        address _vault,
        uint256 _maturity
    ) ERC20(name, symbol) Ownable(msg.sender) {
        require(_underlyingAsset != address(0), "Invalid underlying asset");
        require(_vault != address(0), "Invalid vault");
        require(_maturity > block.timestamp, "Maturity must be in future");

        underlyingAsset = _underlyingAsset;
        vault = _vault;
        maturity = _maturity;
    }

    // ============ External Functions ============

    /**
     * @notice Mint YT tokens
     * @param to Recipient address
     * @param amount Amount to mint
     */
    function mint(address to, uint256 amount) external onlyOwner {
        require(to != address(0), "Invalid recipient");
        require(amount > 0, "Amount must be greater than 0");

        // Update user yield debt before minting
        if (balanceOf(to) > 0) {
            _claimYield(to);
        }

        _mint(to, amount);

        // Set initial debt for new tokens
        userYieldDebt[to] = balanceOf(to) * accumulatedYieldRate / 1e18;
    }

    /**
     * @notice Burn YT tokens
     * @param amount Amount to burn
     */
    function burn(uint256 amount) external {
        require(amount > 0, "Amount must be greater than 0");
        require(balanceOf(msg.sender) >= amount, "Insufficient balance");

        // Claim pending yield first
        _claimYield(msg.sender);

        _burn(msg.sender, amount);

        // Update user yield debt
        userYieldDebt[msg.sender] = balanceOf(msg.sender) * accumulatedYieldRate / 1e18;
    }

    /**
     * @notice Distribute yield to all YT holders
     * @param yieldAmount Amount of yield to distribute
     */
    function distributeYield(uint256 yieldAmount) external onlyOwner {
        require(yieldAmount > 0, "No yield to distribute");
        require(totalSupply() > 0, "No YT holders");

        // Update accumulated yield rate
        accumulatedYieldRate += (yieldAmount * 1e18) / totalSupply();

        emit YieldDistributed(yieldAmount);
    }

    /**
     * @notice Claim pending yield
     * @return yieldAmount Amount of yield claimed
     */
    function claimYield() external returns (uint256 yieldAmount) {
        return _claimYield(msg.sender);
    }

    /**
     * @notice Set the principal token address (one-time only)
     * @param _principalToken Address of the principal token
     */
    function setPrincipalToken(address _principalToken) external onlyOwner {
        require(principalToken == address(0), "Principal token already set");
        require(_principalToken != address(0), "Invalid principal token");

        principalToken = _principalToken;

        emit PrincipalTokenSet(_principalToken);
    }

    /**
     * @notice Finalize yield distribution after maturity
     */
    function finalizeYield() external onlyOwner {
        require(isMatured(), "Not matured yet");

        // Final yield distribution logic
        // YT tokens become worthless after maturity and final yield claim

        emit YieldFinalized(totalYieldClaimed);
    }

    // ============ Public View Functions ============

    /**
     * @notice Check pending yield for a user
     * @param user User address
     * @return Pending yield amount
     */
    function pendingYield(address user) public view returns (uint256) {
        uint256 userBalance = balanceOf(user);
        if (userBalance == 0) {
            return 0;
        }

        uint256 accYield = userBalance * accumulatedYieldRate / 1e18;

        if (accYield > userYieldDebt[user]) {
            return accYield - userYieldDebt[user];
        }

        return 0;
    }

    /**
     * @notice Check if the token has matured
     * @return True if matured
     */
    function isMatured() public view returns (bool) {
        return block.timestamp >= maturity;
    }

    /**
     * @notice Get total claimable yield across all users
     * @return Total claimable yield
     */
    function totalClaimableYield() public view returns (uint256) {
        if (totalSupply() == 0) {
            return 0;
        }
        return (totalSupply() * accumulatedYieldRate / 1e18) - totalYieldClaimed;
    }

    // ============ Internal Functions ============

    /**
     * @notice Internal function to claim yield
     * @param user User address
     * @return yieldAmount Amount of yield claimed
     */
    function _claimYield(address user) internal returns (uint256 yieldAmount) {
        uint256 pending = pendingYield(user);

        if (pending > 0) {
            userYieldClaimed[user] += pending;
            totalYieldClaimed += pending;

            // Transfer yield from vault to user
            // Using SafeERC20 for safe transfer
            IERC20(underlyingAsset).safeTransferFrom(vault, user, pending);

            emit YieldClaimed(user, pending);
        }

        // Update yield debt
        userYieldDebt[user] = balanceOf(user) * accumulatedYieldRate / 1e18;

        return pending;
    }

    /**
     * @notice Hook that is called before any transfer of tokens
     * @dev Claims yield for both sender and recipient before transfer
     */
    function _update(
        address from,
        address to,
        uint256 value
    ) internal virtual override {
        // Claim yield for sender (except minting)
        if (from != address(0) && balanceOf(from) > 0) {
            _claimYield(from);
        }

        // Claim yield for recipient (except burning)
        if (to != address(0) && to != from && balanceOf(to) > 0) {
            _claimYield(to);
        }

        super._update(from, to, value);

        // Update yield debt after transfer
        if (from != address(0)) {
            userYieldDebt[from] = balanceOf(from) * accumulatedYieldRate / 1e18;
        }
        if (to != address(0) && to != from) {
            userYieldDebt[to] = balanceOf(to) * accumulatedYieldRate / 1e18;
        }
    }
}