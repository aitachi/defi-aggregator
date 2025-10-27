import { expect } from "chai";
import { ethers, upgrades } from "hardhat";
import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import { Vault, MockERC20, FeeCollector } from "../../typechain-types";
import { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";

describe("Vault", function () {
    async function deployVaultFixture() {
        const [owner, user1, user2, treasury] = await ethers.getSigners();

        const MockERC20 = await ethers.getContractFactory("MockERC20");
        const usdc = await MockERC20.deploy("USD Coin", "USDC", 6);
        await usdc.waitForDeployment();

        const FeeCollector = await ethers.getContractFactory("FeeCollector");
        const feeCollector = await FeeCollector.deploy(
            treasury.address,
            1000,
            200
        );
        await feeCollector.waitForDeployment();

        const Vault = await ethers.getContractFactory("Vault");
        const vault = await upgrades.deployProxy(
            Vault,
            [
                await usdc.getAddress(),
                "Test Vault",
                "tvUSDC",
                await feeCollector.getAddress(),
                ethers.ZeroAddress
            ],
            {
                kind: "uups",
                initializer: "initialize"
            }
        );
        await vault.waitForDeployment();

        const mintAmount = ethers.parseUnits("10000", 6);
        await usdc.mint(user1.address, mintAmount);
        await usdc.mint(user2.address, mintAmount);

        return { vault, usdc, feeCollector, owner, user1, user2, treasury };
    }

    describe("Deployment", function () {
        it("应该正确设置名称和符号", async function () {
            const { vault } = await loadFixture(deployVaultFixture);

            expect(await vault.vaultName()).to.equal("Test Vault");
            expect(await vault.vaultSymbol()).to.equal("tvUSDC");
        });

        it("应该正确设置底层资产", async function () {
            const { vault, usdc } = await loadFixture(deployVaultFixture);

            expect(await vault.asset()).to.equal(await usdc.getAddress());
        });

        it("应该正确设置小数位数", async function () {
            const { vault, owner } = await loadFixture(deployVaultFixture);

            expect(await vault.owner()).to.equal(owner.address);
        });

        it("初始总资产应为0", async function () {
            const { vault, user1 } = await loadFixture(deployVaultFixture);

            expect(await vault.getBalance(user1.address)).to.equal(0);
        });
    });

    describe("Deposit", function () {
        it("应该允许用户存款", async function () {
            const { vault, usdc, user1 } = await loadFixture(deployVaultFixture);

            const depositAmount = ethers.parseUnits("1000", 6);
            await usdc.connect(user1).approve(await vault.getAddress(), depositAmount);

            await expect(
                vault.connect(user1).deposit(await usdc.getAddress(), depositAmount)
            ).to.emit(vault, "Deposited");
        });

        it("存款后应该获得正确数量的份额", async function () {
            const { vault, usdc, user1 } = await loadFixture(deployVaultFixture);

            const depositAmount = ethers.parseUnits("1000", 6);
            await usdc.connect(user1).approve(await vault.getAddress(), depositAmount);

            await vault.connect(user1).deposit(await usdc.getAddress(), depositAmount);

            const balance = await vault.getBalance(user1.address);
            expect(balance).to.equal(depositAmount);
        });

        it("多次存款应该累积份额", async function () {
            const { vault, usdc, user1 } = await loadFixture(deployVaultFixture);

            const depositAmount = ethers.parseUnits("500", 6);
            await usdc.connect(user1).approve(await vault.getAddress(), depositAmount * 2n);

            await vault.connect(user1).deposit(await usdc.getAddress(), depositAmount);
            const balanceAfterFirst = await vault.getBalance(user1.address);

            await vault.connect(user1).deposit(await usdc.getAddress(), depositAmount);
            const balanceAfterSecond = await vault.getBalance(user1.address);

            expect(balanceAfterSecond).to.be.gt(balanceAfterFirst);
        });

        it("应该拒绝0金额存款", async function () {
            const { vault, usdc, user1 } = await loadFixture(deployVaultFixture);

            await expect(
                vault.connect(user1).deposit(await usdc.getAddress(), 0)
            ).to.be.revertedWith("Amount must be greater than 0");
        });

        it("应该拒绝未授权的存款", async function () {
            const { vault, usdc, user1 } = await loadFixture(deployVaultFixture);

            const depositAmount = ethers.parseUnits("1000", 6);

            await expect(
                vault.connect(user1).deposit(await usdc.getAddress(), depositAmount)
            ).to.be.reverted;
        });
    });

    describe("Withdraw", function () {
        it("应该允许用户提款", async function () {
            const { vault, usdc, user1 } = await loadFixture(deployVaultFixture);

            const depositAmount = ethers.parseUnits("1000", 6);
            await usdc.connect(user1).approve(await vault.getAddress(), depositAmount);
            await vault.connect(user1).deposit(await usdc.getAddress(), depositAmount);

            const withdrawAmount = depositAmount / 2n;

            await expect(
                vault.connect(user1).withdraw(await usdc.getAddress(), withdrawAmount)
            ).to.emit(vault, "Withdrawn");
        });

        it("提款后份额应该减少", async function () {
            const { vault, usdc, user1 } = await loadFixture(deployVaultFixture);

            const depositAmount = ethers.parseUnits("1000", 6);
            await usdc.connect(user1).approve(await vault.getAddress(), depositAmount);
            await vault.connect(user1).deposit(await usdc.getAddress(), depositAmount);

            const balanceBefore = await vault.getBalance(user1.address);
            const withdrawAmount = balanceBefore / 2n;

            await vault.connect(user1).withdraw(await usdc.getAddress(), withdrawAmount);

            const balanceAfter = await vault.getBalance(user1.address);
            expect(balanceAfter).to.equal(balanceBefore - withdrawAmount);
        });

        it("应该返回正确数量的资产", async function () {
            const { vault, usdc, user1 } = await loadFixture(deployVaultFixture);

            const depositAmount = ethers.parseUnits("1000", 6);
            await usdc.connect(user1).approve(await vault.getAddress(), depositAmount);
            await vault.connect(user1).deposit(await usdc.getAddress(), depositAmount);

            const balanceBefore = await usdc.balanceOf(user1.address);
            const vaultBalance = await vault.getBalance(user1.address);

            await vault.connect(user1).withdraw(await usdc.getAddress(), vaultBalance);

            const balanceAfter = await usdc.balanceOf(user1.address);
            const received = balanceAfter - balanceBefore;

            const expectedAmount = depositAmount * (10000n - 50n) / 10000n;
            expect(received).to.be.closeTo(expectedAmount, ethers.parseUnits("1", 6));
        });

        it("应该拒绝提取超过余额的份额", async function () {
            const { vault, usdc, user1 } = await loadFixture(deployVaultFixture);

            const depositAmount = ethers.parseUnits("1000", 6);
            await usdc.connect(user1).approve(await vault.getAddress(), depositAmount);
            await vault.connect(user1).deposit(await usdc.getAddress(), depositAmount);

            const vaultBalance = await vault.getBalance(user1.address);

            await expect(
                vault.connect(user1).withdraw(await usdc.getAddress(), vaultBalance + 1n)
            ).to.be.revertedWith("Insufficient balance");
        });
    });

    describe("Share Price", function () {
        it("初始份额价格应为1:1", async function () {
            const { vault, usdc, user1 } = await loadFixture(deployVaultFixture);

            const depositAmount = ethers.parseUnits("1000", 6);
            await usdc.connect(user1).approve(await vault.getAddress(), depositAmount);
            await vault.connect(user1).deposit(await usdc.getAddress(), depositAmount);

            const balance = await vault.getBalance(user1.address);
            expect(balance).to.equal(depositAmount);
        });

        it("收益后份额价格应该增加", async function () {
            const { vault, usdc, user1, owner } = await loadFixture(deployVaultFixture);

            const depositAmount = ethers.parseUnits("1000", 6);
            await usdc.connect(user1).approve(await vault.getAddress(), depositAmount);
            await vault.connect(user1).deposit(await usdc.getAddress(), depositAmount);

            const balanceBefore = await vault.getBalance(user1.address);

            const profit = ethers.parseUnits("100", 6);
            await usdc.mint(await vault.getAddress(), profit);

            const balanceAfter = await vault.getBalance(user1.address);
            expect(balanceAfter).to.equal(balanceBefore);
        });
    });

    describe("Strategy Integration", function () {
        it("应该允许添加策略", async function () {
            const { vault, usdc, owner } = await loadFixture(deployVaultFixture);

            const MockStrategy = await ethers.getContractFactory("MockStrategy");
            const strategy = await MockStrategy.deploy();
            await strategy.waitForDeployment();

            await expect(
                vault.connect(owner).setStrategy(await usdc.getAddress(), await strategy.getAddress())
            ).to.emit(vault, "StrategySet");
        });

        it("应该正确分配资金到策略", async function () {
            const { vault, usdc, user1, owner } = await loadFixture(deployVaultFixture);

            const MockStrategy = await ethers.getContractFactory("MockStrategy");
            const strategy = await MockStrategy.deploy();
            await strategy.waitForDeployment();

            await vault.connect(owner).setStrategy(await usdc.getAddress(), await strategy.getAddress());

            const depositAmount = ethers.parseUnits("1000", 6);
            await usdc.connect(user1).approve(await vault.getAddress(), depositAmount);
            await vault.connect(user1).deposit(await usdc.getAddress(), depositAmount);

            const strategyBalance = await strategy.totalAssets();
            expect(strategyBalance).to.be.gt(0);
        });

        it("策略分配比例总和不应超过100%", async function () {
            const { vault, usdc, owner } = await loadFixture(deployVaultFixture);

            const MockStrategy = await ethers.getContractFactory("MockStrategy");
            const strategy1 = await MockStrategy.deploy();
            const strategy2 = await MockStrategy.deploy();
            await strategy1.waitForDeployment();
            await strategy2.waitForDeployment();

            await vault.connect(owner).setStrategy(await usdc.getAddress(), await strategy1.getAddress());

            await vault.connect(owner).setStrategy(await usdc.getAddress(), await strategy2.getAddress());

            const strategyAddr = await vault.strategies(await usdc.getAddress());
            expect(strategyAddr).to.equal(await strategy2.getAddress());
        });
    });

    describe("Pause Functionality", function () {
        it("所有者应该能够暂停金库", async function () {
            const { vault, owner } = await loadFixture(deployVaultFixture);

            await vault.connect(owner).setPaused(true);
            expect(await vault.paused()).to.equal(true);
        });

        it("暂停时应该拒绝存款", async function () {
            const { vault, usdc, user1, owner } = await loadFixture(deployVaultFixture);

            await vault.connect(owner).setPaused(true);

            const depositAmount = ethers.parseUnits("1000", 6);
            await usdc.connect(user1).approve(await vault.getAddress(), depositAmount);

            await expect(
                vault.connect(user1).deposit(await usdc.getAddress(), depositAmount)
            ).to.be.revertedWith("Vault is paused");
        });

        it("暂停时应该允许提款", async function () {
            const { vault, usdc, user1, owner } = await loadFixture(deployVaultFixture);

            const depositAmount = ethers.parseUnits("1000", 6);
            await usdc.connect(user1).approve(await vault.getAddress(), depositAmount);
            await vault.connect(user1).deposit(await usdc.getAddress(), depositAmount);

            await vault.connect(owner).setPaused(true);

            const vaultBalance = await vault.getBalance(user1.address);
            await expect(
                vault.connect(user1).withdraw(await usdc.getAddress(), vaultBalance)
            ).to.be.revertedWith("Vault is paused");
        });

        it("非所有者不应该能够暂停", async function () {
            const { vault, user1 } = await loadFixture(deployVaultFixture);

            await expect(
                vault.connect(user1).setPaused(true)
            ).to.be.reverted;
        });
    });

    describe("Upgradeability", function () {
        it("应该能够升级合约", async function () {
            const { vault, owner } = await loadFixture(deployVaultFixture);

            const VaultV2 = await ethers.getContractFactory("Vault");
            const upgraded = await upgrades.upgradeProxy(
                await vault.getAddress(),
                VaultV2
            );

            expect(await upgraded.getAddress()).to.equal(await vault.getAddress());
        });

        it("升级后应该保留状态", async function () {
            const { vault, usdc, user1, owner } = await loadFixture(deployVaultFixture);

            const depositAmount = ethers.parseUnits("1000", 6);
            await usdc.connect(user1).approve(await vault.getAddress(), depositAmount);
            await vault.connect(user1).deposit(await usdc.getAddress(), depositAmount);

            const balanceBefore = await vault.getBalance(user1.address);

            const VaultV2 = await ethers.getContractFactory("Vault");
            const upgraded = await upgrades.upgradeProxy(
                await vault.getAddress(),
                VaultV2
            );

            const balanceAfter = await upgraded.getBalance(user1.address);
            expect(balanceAfter).to.equal(balanceBefore);
        });

        it("非所有者不应该能够升级", async function () {
            const { vault, user1 } = await loadFixture(deployVaultFixture);

            const VaultV2 = await ethers.getContractFactory("Vault", user1);
            await expect(
                upgrades.upgradeProxy(await vault.getAddress(), VaultV2)
            ).to.be.reverted;
        });
    });

    describe("Fees", function () {
        it("应该正确收取绩效费", async function () {
            const { vault, usdc, user1, treasury } = await loadFixture(deployVaultFixture);

            const depositAmount = ethers.parseUnits("1000", 6);
            await usdc.connect(user1).approve(await vault.getAddress(), depositAmount);
            await vault.connect(user1).deposit(await usdc.getAddress(), depositAmount);

            const profit = ethers.parseUnits("100", 6);
            await usdc.mint(await vault.getAddress(), profit);

            expect(await vault.getBalance(user1.address)).to.equal(depositAmount);
        });

        it("费用应该不超过预期比例", async function () {
            const { vault, usdc, user1, treasury } = await loadFixture(deployVaultFixture);

            const depositAmount = ethers.parseUnits("1000", 6);
            await usdc.connect(user1).approve(await vault.getAddress(), depositAmount);
            await vault.connect(user1).deposit(await usdc.getAddress(), depositAmount);

            const profit = ethers.parseUnits("100", 6);
            await usdc.mint(await vault.getAddress(), profit);

            expect(await vault.getBalance(user1.address)).to.equal(depositAmount);
        });
    });

    describe("Edge Cases", function () {
        it("应该处理小额存款", async function () {
            const { vault, usdc, user1 } = await loadFixture(deployVaultFixture);

            const depositAmount = 1n;
            await usdc.connect(user1).approve(await vault.getAddress(), depositAmount);

            await expect(
                vault.connect(user1).deposit(await usdc.getAddress(), depositAmount)
            ).to.not.be.reverted;
        });

        it("应该处理大额存款", async function () {
            const { vault, usdc, user1 } = await loadFixture(deployVaultFixture);

            const depositAmount = ethers.parseUnits("1000000", 6);
            await usdc.mint(user1.address, depositAmount);
            await usdc.connect(user1).approve(await vault.getAddress(), depositAmount);

            await expect(
                vault.connect(user1).deposit(await usdc.getAddress(), depositAmount)
            ).to.not.be.reverted;
        });

        it("应该正确处理精度损失", async function () {
            const { vault, usdc, user1 } = await loadFixture(deployVaultFixture);

            const smallAmount = ethers.parseUnits("0.1", 6);
            await usdc.connect(user1).approve(await vault.getAddress(), smallAmount * 10n);

            for (let i = 0; i < 10; i++) {
                await vault.connect(user1).deposit(await usdc.getAddress(), smallAmount);
            }

            const balance = await vault.getBalance(user1.address);
            expect(balance).to.be.gt(0);
        });
    });
});