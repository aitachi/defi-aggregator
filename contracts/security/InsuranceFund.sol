// SPDX-License-Identifier: MIT
pragma solidity ^0.8.22;

import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol"; // �?修改此行
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

/**
 * @title InsuranceFund
 * @notice 保险基金 - 覆盖协议损失
 */
contract InsuranceFund is AccessControl, ReentrancyGuard {
    bytes32 public constant CLAIM_HANDLER_ROLE = keccak256("CLAIM_HANDLER_ROLE");

    struct Claim {
        uint256 id;
        address claimant;
        address token;
        uint256 amount;
        string reason;
        ClaimStatus status;
        uint256 createdAt;
        uint256 approvedAt;
        uint256 approvalCount;
    }

    enum ClaimStatus {
        Pending,
        Approved,
        Rejected,
        Paid
    }

    mapping(uint256 => Claim) public claims;
    mapping(uint256 => mapping(address => bool)) public claimApprovals;

    uint256 public claimCounter;
    uint256 public requiredApprovals = 2;

    // 资金�?
    mapping(address => uint256) public fundBalance;

    // 最大索赔额�?
    mapping(address => uint256) public maxClaimAmount;

    event FundDeposited(address indexed token, uint256 amount, address indexed depositor);
    event ClaimSubmitted(uint256 indexed claimId, address indexed claimant, uint256 amount);
    event ClaimApproved(uint256 indexed claimId, address indexed approver);
    event ClaimRejected(uint256 indexed claimId);
    event ClaimPaid(uint256 indexed claimId, uint256 amount);

    constructor() {
        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
        _grantRole(CLAIM_HANDLER_ROLE, msg.sender);
    }

    /**
     * @notice 存入资金到保险池
     */
    function deposit(address token, uint256 amount) external {
        require(amount > 0, "Cannot deposit 0");

        IERC20(token).transferFrom(msg.sender, address(this), amount);
        fundBalance[token] += amount;

        emit FundDeposited(token, amount, msg.sender);
    }

    /**
     * @notice 提交索赔申请
     */
    function submitClaim(
        address token,
        uint256 amount,
        string calldata reason
    ) external returns (uint256 claimId) {
        require(amount > 0, "Invalid amount");
        require(amount <= maxClaimAmount[token], "Exceeds max claim");
        require(fundBalance[token] >= amount, "Insufficient fund");

        claimId = ++claimCounter;

        claims[claimId] = Claim({
            id: claimId,
            claimant: msg.sender,
            token: token,
            amount: amount,
            reason: reason,
            status: ClaimStatus.Pending,
            createdAt: block.timestamp,
            approvedAt: 0,
            approvalCount: 0
        });

        emit ClaimSubmitted(claimId, msg.sender, amount);
    }

    /**
     * @notice 批准索赔
     */
    function approveClaim(uint256 claimId)
    external
    onlyRole(CLAIM_HANDLER_ROLE)
    {
        Claim storage claim = claims[claimId];
        require(claim.status == ClaimStatus.Pending, "Invalid status");
        require(!claimApprovals[claimId][msg.sender], "Already approved");

        claimApprovals[claimId][msg.sender] = true;
        claim.approvalCount++;

        emit ClaimApproved(claimId, msg.sender);

        // 达到所需批准数量，自动支�?
        if (claim.approvalCount >= requiredApprovals) {
            claim.status = ClaimStatus.Approved;
            claim.approvedAt = block.timestamp;
            _payClaim(claimId);
        }
    }

    /**
     * @notice 拒绝索赔
     */
    function rejectClaim(uint256 claimId)
    external
    onlyRole(CLAIM_HANDLER_ROLE)
    {
        Claim storage claim = claims[claimId];
        require(claim.status == ClaimStatus.Pending, "Invalid status");

        claim.status = ClaimStatus.Rejected;

        emit ClaimRejected(claimId);
    }

    /**
     * @notice 支付索赔
     */
    function _payClaim(uint256 claimId) internal nonReentrant {
        Claim storage claim = claims[claimId];
        require(claim.status == ClaimStatus.Approved, "Not approved");
        require(fundBalance[claim.token] >= claim.amount, "Insufficient fund");

        fundBalance[claim.token] -= claim.amount;
        claim.status = ClaimStatus.Paid;

        IERC20(claim.token).transfer(claim.claimant, claim.amount);

        emit ClaimPaid(claimId, claim.amount);
    }

    /**
     * @notice 设置最大索赔额�?
     */
    function setMaxClaimAmount(address token, uint256 amount)
    external
    onlyRole(DEFAULT_ADMIN_ROLE)
    {
        maxClaimAmount[token] = amount;
    }

    /**
     * @notice 设置所需批准数量
     */
    function setRequiredApprovals(uint256 count)
    external
    onlyRole(DEFAULT_ADMIN_ROLE)
    {
        require(count > 0 && count <= 5, "Invalid count");
        requiredApprovals = count;
    }

    /**
     * @notice 获取待处理索�?
     */
    function getPendingClaims()
    external
    view
    returns (uint256[] memory)
    {
        uint256 count = 0;
        for (uint256 i = 1; i <= claimCounter; i++) {
            if (claims[i].status == ClaimStatus.Pending) {
                count++;
            }
        }

        uint256[] memory pendingClaims = new uint256[](count);
        uint256 index = 0;
        for (uint256 i = 1; i <= claimCounter; i++) {
            if (claims[i].status == ClaimStatus.Pending) {
                pendingClaims[index++] = i;
            }
        }

        return pendingClaims;
    }

    /**
     * @notice 获取资金池余�?
     */
    function getFundBalance(address token) external view returns (uint256) {
        return fundBalance[token];
    }

    /**
     * @notice 紧急提�?仅管理员)
     */
    function emergencyWithdraw(address token, uint256 amount)
    external
    onlyRole(DEFAULT_ADMIN_ROLE)
    {
        require(fundBalance[token] >= amount, "Insufficient balance");
        fundBalance[token] -= amount;
        IERC20(token).transfer(msg.sender, amount);
    }
}
