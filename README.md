### DeFi Aggregator
项目概述
DeFi Aggregator 是一个功能完整的多链DeFi收益聚合器，集成了收益聚合、杠杆交易、跨链桥接、元交易等核心功能。项目采用模块化设计，支持多种DeFi协议，为用户提供一站式的DeFi服务体验。
核心特性
📈 多协议收益聚合: 集成Aave、Compound、Curve等主流协议
⚡ 杠杆交易引擎: 支持最高5倍杠杆交易
🌉 跨链桥接: 支持多链资产转移和消息传递
⛽ 无Gas交易: 元交易支持，用户无需支付Gas费用
🛡️ 企业级安全: 多重安全机制和保险基金
🤖 自动化管理: 再平衡机器人和收益收割
项目架构

```tex
contracts/
├── core/              # 核心系统
│   ├── Vault.sol      # 金库管理
│   ├── StrategyManager.sol # 策略管理
│   └── VaultFactory.sol    # 金库工厂
├── leverage/          # 杠杆交易
│   ├── LeverageEngine.sol  # 杠杆引擎
│   ├── LeverageHelper.sol  # 杠杆助手
│   └── LiquidationBot.sol  # 清算机器人
├── crosschain/        # 跨链功能
│   ├── CrossChainBridge.sol # 跨链桥
│   └── L2Messenger.sol     # Layer2消息
├── metatx/           # 元交易
│   ├── MetaTxForwarder.sol # 元交易转发
│   ├── GasStation.sol      # Gas站
│   └── BatchExecutor.sol   # 批量执行
├── strategies/       # 收益策略
│   ├── BaseStrategy.sol    # 基础策略
│   ├── AaveStrategy.sol    # Aave策略
│   ├── CompoundStrategy.sol # Compound策略
│   └── CurveStrategy.sol   # Curve策略
├── security/         # 安全组件
│   ├── EmergencyStop.sol   # 紧急停止
│   ├── AccessControl.sol   # 访问控制
│   └── InsuranceFund.sol   # 保险基金
└── tokens/           # 代币合约
    ├── PrincipalToken.sol  # 本金代币
    └── YieldToken.sol      # 收益代币

```











#### 环境配置
前置要求
Node.js 18+
npm 或 yarn
Hardhat
以太坊钱包（MetaMask等）
安装依赖

```bash
npm install
```

#### 环境变量配置
创建 .env 文件并配置以下变量：

```bas
ALCHEMY_API_KEY=your_alchemy_api_key
PRIVATE_KEY=your_private_key
ETHERSCAN_API_KEY=your_etherscan_api_key

```

#### 测试命令
单元测试

```te
npx hardhat test
```

##### 运行特定测试文件

```te
npx hardhat test test/unit/Vault.test.ts
npx hardhat test test/unit/MetaTxForwarder.test.ts
npx hardhat test test/unit/LeverageEngine.test.ts
npx hardhat test test/integration/YieldAggregator.test.ts
```

#### 测试网测试

```te
npx hardhat test --network sepolia
```

#### 部署命令
完整部署到Sepolia

```te
npx hardhat run scripts/deploy.ts --network sepolia
```

#### 合约验证

```te
npx hardhat verify --network sepolia <contract-address>
```

#### 开发工作流

1. 本地开发

   ```te
   npx hardhat compile
   npx hardhat test
   ```

2. 测试网验证

   ```te
   npx hardhat run scripts/deploy.ts --network sepolia
   ```

3. 生产部署

   ```te
   npx hardhat run scripts/deploy.ts --network mainnet
   ```

#### 常用开发命令

```bas 
# 编译合约
npx hardhat compile

# 清理编译产物
npx hardhat clean

# 启动本地网络
npx hardhat node

# 运行脚本
npx hardhat run <script-name>

# 合约验证
npx hardhat verify <contract-address> <constructor-args>
```

### 故障排除
常见问题
编译错误: 确保Solidity版本匹配，运行 npm run clean && npm run compile
网络连接问题: 检查RPC URL配置和网络状态
Gas费用不足: 确保测试账户有足够的ETH
合约验证失败: 检查构造函数参数和编译器设置
获取帮助
查看Hardhat文档: https://hardhat.org/docs
检查项目issue页面
联系开发团队
许可证
MIT License - 详见LICENSE文件
贡献指南
欢迎提交Issue和Pull Request！请确保：
代码符合项目编码规范
添加相应的测试用例
更新相关文档
注意: 在生产环境部署前，请务必进行充分的安全审计和测试！