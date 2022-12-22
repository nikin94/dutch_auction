import { expect } from "chai";
import { ethers } from "hardhat";

describe("AucEngine", function () {
  let owner, seller, buyer, auct;

  beforeEach(async function () {
    [owner, seller, buyer] = await ethers.getSigners();

    const AucEngine = await ethers.getContractFactory("AucEngine", owner);
    auct = await AucEngine.deploy();
    await auct.deployed();
  });

  it("sets owner", async () => {
    const currentOwner = await auct.owner();
    expect(currentOwner).to.eq(owner.address);
  });

  async function getTimestamp(bn) {
    return (await ethers.provider.getBlock(bn)).timestamp;
  }

  describe("createAuction", function () {
    it("Creates auction correctly", async () => {
      const duration = 60;
      const tx = await auct.createAuction(
        ethers.utils.parseEther("0.0001"),
        3,
        "fake item",
        duration
      );

      const cAuction = await auct.auctions(0);
      expect(cAuction.item).to.eq("fake item");
      const ts = await getTimestamp(tx.blockNumber);
      expect(cAuction.endsAt).to.eq(ts + duration);
    });

    it("Reverts if starting price is incorrect", async () => {
      await expect(
        auct.createAuction(
          ethers.utils.parseEther("0.0000000000000001"),
          3,
          "fake item",
          60
        )
      ).to.be.revertedWith("incorrect starting price");
    });
  });

  function delay(ms: number) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  describe("buy", function () {
    it("Allows to buy", async () => {
      await auct
        .connect(seller)
        .createAuction(ethers.utils.parseEther("0.0001"), 3, "fake item", 60);

      await auct
        .connect(seller)
        .createAuction(ethers.utils.parseEther("0.0001"), 3, "fake item 2", 1);

      this.timeout(5000);
      await delay(1000);

      await expect(
        auct.connect(buyer).buy(1, { value: ethers.utils.parseEther("0.0001") })
      ).to.be.revertedWith("ended!");

      await expect(
        auct
          .connect(buyer)
          .buy(0, { value: ethers.utils.parseEther("0.00000000000000001") })
      ).to.be.revertedWith("not enough funds!");

      const buyTx = await auct
        .connect(buyer)
        .buy(0, { value: ethers.utils.parseEther("0.0001") });

      const cAuction = await auct.auctions(0);
      const finalPrice = cAuction.finalPrice;
      await expect(() => buyTx).to.changeEtherBalance(
        seller,
        finalPrice - Math.floor((finalPrice * 10) / 100)
      );

      await expect(buyTx)
        .to.emit(auct, "AuctionEnded")
        .withArgs(0, finalPrice, buyer.address);

      await expect(
        auct.connect(buyer).buy(0, { value: ethers.utils.parseEther("0.0001") })
      ).to.be.revertedWith("stopped!");

      await expect(auct.getPriceFor(0)).to.be.revertedWith("stopped!");
    });
  });
});
