class MainScene extends Phaser.Scene {
  constructor() {
    super('MainScene');

    // Для кошелька
    this.provider = null;
    this.signer = null;
    this.walletAddress = null;

    // Адрес токена WPHRS
    this.tokenAddress = '0x3019B247381c850ab53Dc0EE53bCe7A07Ea9155f';
    this.erc20Abi = [
      "function balanceOf(address) view returns (uint)",
      "function transfer(address to, uint amount) returns (bool)"
    ];

    // Депозитный адрес для ставок
    this.depositAddress = '0x6EC8C121043357aC231E36D403EdAbf90AE6989B';
  }

  preload() {
    this.load.image('sky', 'assets/sky.png');
    this.load.image('water', 'assets/water.png');
    this.load.image('player', 'assets/sticker.webp');
    this.load.image('lighthouse', 'assets/lighthouse.png');
    this.load.image('beam', 'assets/beam.webp');
  }

  create() {
    const width = this.scale.width;
    const height = this.scale.height;

    this.add.image(width / 2, height / 2, 'sky').setDisplaySize(width, height);

    this.water = this.add.image(width / 2, height, 'water').setOrigin(0.5, 1);
    this.water.setDisplaySize(width, this.water.height);

    this.groundLevel = this.water.y - this.water.displayHeight;

    this.lighthouse = this.physics.add.staticImage(width - 100 * (width / 800), this.groundLevel, 'lighthouse')
      .setOrigin(0.5, 0.65)
      .setDisplaySize(150 * (width / 800), 450 * (height / 600));
    this.lighthouse.refreshBody();

    this.player = this.physics.add.sprite(50 * (width / 800), this.groundLevel, 'player')
      .setOrigin(0.5, 1)
      .setScale(0.2 * Math.min(width / 800, height / 600));
    this.player.setCollideWorldBounds(true);
    this.player.body.setGravityY(900 * (height / 600));

    this.beams = this.physics.add.group();

    this.physics.add.overlap(this.player, this.beams, () => {
      this.handleLose();
    });

    this.physics.add.overlap(this.player, this.lighthouse, () => {
      this.handleWin();
    });

    this.cursors = this.input.keyboard.createCursorKeys();
    this.keys = this.input.keyboard.addKeys({
      left: Phaser.Input.Keyboard.KeyCodes.A,
      right: Phaser.Input.Keyboard.KeyCodes.D,
      space: Phaser.Input.Keyboard.KeyCodes.SPACE
    });

    this.messageText = this.add.text(10, 10, '', { 
      fontSize: Math.min(width, height) * 0.04 + 'px', 
      fill: '#ffffff' 
    });

    this.connectButton = this.add.text(10, height * 0.1, 'Connect Wallet', { 
      fontSize: Math.min(width, height) * 0.04 + 'px', 
      fill: '#00ff00' 
    })
      .setInteractive()
      .on('pointerdown', () => this.connectWallet());

    this.walletText = this.add.text(10, height * 0.15, 'Wallet: Not connected', { 
      fontSize: Math.min(width, height) * 0.03 + 'px', 
      fill: '#ffffff' 
    });

    this.balanceText = this.add.text(10, height * 0.25, 'Balance: -', { 
      fontSize: Math.min(width, height) * 0.03 + 'px', 
      fill: '#ffff00' 
    });

    this.startButton = this.add.text(10, height * 0.2, 'Start Game', { 
      fontSize: Math.min(width, height) * 0.04 + 'px', 
      fill: '#00ffff' 
    })
      .setInteractive()
      .on('pointerdown', async () => {
        if (!this.walletAddress) {
          this.updateMessage('Please connect your wallet first.');
          return;
        }
        const paid = await this.payStake();
        if (paid) {
          await this.updateBalance();
          this.scene.restart();
        }
      });

    this.fullscreenButton = this.add.text(10, height * 0.3, 'Toggle Fullscreen', { 
      fontSize: Math.min(width, height) * 0.04 + 'px', 
      fill: '#ff00ff' 
    })
      .setInteractive()
      .on('pointerdown', () => {
        if (this.scale.isFullscreen) {
          this.scale.stopFullscreen();
        } else {
          this.scale.startFullscreen();
        }
      });

    this.gameStarted = false;
    this.countdownText = this.add.text(width / 2, height / 2, 'Press Space to Start', { 
      fontSize: Math.min(width, height) * 0.06 + 'px', 
      fill: '#ffffff' 
    }).setOrigin(0.5);
  }

  startCountdown() {
    this.countdownText.setText('3');
    this.time.delayedCall(1000, () => {
      this.countdownText.setText('2');
    }, [], this);
    this.time.delayedCall(2000, () => {
      this.countdownText.setText('1');
    }, [], this);
    this.time.delayedCall(3000, () => {
      this.countdownText.setText('0');
      this.startGame();
    }, [], this);
  }

  startGame() {
    this.gameStarted = true;
    this.countdownText.destroy();
    this.time.addEvent({
      delay: 1000,
      callback: this.spawnWave,
      callbackScope: this,
      loop: true
    });
  }

  async connectWallet() {
    if (!window.ethereum) {
      alert('Please install MetaMask or another Ethereum wallet.');
      return;
    }

    try {
      console.log('Requesting wallet accounts...');
      const accounts = await window.ethereum.request({ method: 'eth_requestAccounts' });
      console.log('Accounts:', accounts);
      this.walletAddress = accounts[0];

      await this.switchToPharos();

      this.provider = new ethers.providers.Web3Provider(window.ethereum);
      this.signer = this.provider.getSigner();
      this.walletAddress = await this.signer.getAddress();
      this.walletText.setText(`Wallet: ${this.walletAddress.slice(0, 6)}...${this.walletAddress.slice(-4)}`);

      const network = await this.provider.getNetwork();
      console.log('Connected to network:', network);

      await this.updateBalance();

      window.ethereum.on('chainChanged', async (chainId) => {
        console.log('Chain changed:', chainId);
        if (chainId !== '0xa8230') {
          this.updateMessage('Please switch to Pharos Network.');
        } else {
          await this.updateBalance();
          this.updateMessage();
        }
      });

      console.log('Wallet connected:', this.walletAddress);

    } catch (error) {
      console.error('Wallet connection or network switch error:', error);
      this.updateMessage('Wallet connection or network switch failed.');
    }
  }

  async switchToPharos() {
    if (!window.ethereum) return;
    try {
      await window.ethereum.request({
        method: 'wallet_switchEthereumChain',
        params: [{ chainId: '0xa8230' }]
      });
    } catch (error) {
      if (error.code === 4902) {
        try {
          await window.ethereum.request({
            method: 'wallet_addEthereumChain',
            params: [{
              chainId: '0xa8230',
              chainName: 'Pharos Testnet',
              nativeCurrency: {
                name: 'Wrapped PHRS',
                symbol: 'WPHRS',
                decimals: 18
              },
              rpcUrls: ['https://testnet.dplabs-internal.com'],
              blockExplorerUrls: ['https://testnet.pharosscan.xyz']
            }]
          });
          await window.ethereum.request({
            method: 'wallet_switchEthereumChain',
            params: [{ chainId: '0xa8230' }]
          });
        } catch (addError) {
          console.error('Failed to add Pharos Testnet', addError);
          throw addError;
        }
      } else {
        throw error;
      }
    }
  }

  async payStake() {
    const stakeAmount = ethers.utils.parseUnits('0.001', 18);

    if (!this.signer) {
      this.updateMessage('Please connect your wallet first');
      return false;
    }

    try {
      const tokenContract = new ethers.Contract(this.tokenAddress, this.erc20Abi, this.signer);
      const balance = await tokenContract.balanceOf(this.walletAddress);
      console.log('Balance raw:', balance.toString());

      if (balance.lt(stakeAmount)) {
        this.updateMessage('Insufficient WPHRS balance for stake.');
        return false;
      }

      this.updateMessage('Sending stake payment...');
      const tx = await tokenContract.transfer(this.depositAddress, stakeAmount);
      console.log('Transaction sent:', tx.hash);
      await tx.wait();
      this.updateMessage('Stake payment successful! Starting game...');
      return true;
    } catch (err) {
      console.error('Stake payment failed:', err);
      this.updateMessage('Stake payment failed: ' + (err.data?.message || err.message || err));
      return false;
    }
  }

  async updateBalance() {
    if (!this.provider || !this.walletAddress) {
      this.balanceText.setText('Balance: -');
      return;
    }

    try {
      const tokenContract = new ethers.Contract(this.tokenAddress, this.erc20Abi, this.provider);
      const balanceRaw = await tokenContract.balanceOf(this.walletAddress);
      console.log('Fetched raw balance:', balanceRaw.toString());
      const balance = ethers.utils.formatUnits(balanceRaw, 18);
      this.balanceText.setText(`Balance: ${balance} WPHRS`);
    } catch (error) {
      console.error('Failed to fetch balance:', error);
      this.balanceText.setText(`Balance: error - ${error.message}`);
    }
  }

  updateMessage(text) {
    this.messageText.setText(text || '');
  }

  handleWin() {
    this.updateMessage('Congratulations! Contact admin to claim 0.01 WPHRS.');
    this.physics.pause();
    this.time.removeAllEvents();
  }

  handleLose() {
    this.updateMessage('You lost! Try again.');
    this.scene.restart();
  }

  spawnWave() {
    const width = this.scale.width;
    const height = this.scale.height;
    const waveHeights = [150, 250, 350, 450, 550].map(h => h * (height / 600));
    const waveY = waveHeights[Phaser.Math.Between(0, waveHeights.length - 1)];

    let wave = this.beams.create(this.lighthouse.x - 250 * (width / 800), waveY, 'beam')
      .setOrigin(0.05, 0.1)
      .setScale(Phaser.Math.FloatBetween(0.05, 0.2) * Math.min(width / 800, height / 600));

    wave.setVelocityX(-250 * (width / 800));
    wave.body.setAllowGravity(false);

    wave.setCollideWorldBounds(false);
    wave.body.onWorldBounds = true;
    wave.body.world.on('worldbounds', (body) => {
      if (body.gameObject === wave) {
        wave.destroy();
      }
    });
  }

  update() {
    const speed = 200 * (this.scale.width / 800);
    const player = this.player;

    if (this.gameStarted) {
      player.setVelocityX(0);

      if (this.cursors.left.isDown || this.keys.left.isDown) {
        player.setVelocityX(-speed);
      } else if (this.cursors.right.isDown || this.keys.right.isDown) {
        player.setVelocityX(speed);
      }

      if (Phaser.Input.Keyboard.JustDown(this.keys.space) && player.body.onFloor()) {
        player.setVelocityY(-900 * (this.scale.height / 600));
      }
    } else {
      if (Phaser.Input.Keyboard.JustDown(this.keys.space)) {
        this.startCountdown();
      }
      player.setVelocityX(0);
      player.setVelocityY(0);
    }

    this.beams.getChildren().forEach(wave => {
      if (wave.x < -wave.displayWidth) {
        wave.destroy();
      }
    });
  }
}

const config = {
  type: Phaser.AUTO,
  parent: 'game',
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
    width: window.innerWidth,
    height: window.innerHeight
  },
  physics: {
    default: 'arcade',
    arcade: {
      gravity: { y: 0 },
      debug: false
    }
  },
  scene: MainScene
};

const game = new Phaser.Game(config);

window.addEventListener('resize', () => {
  game.scale.resize(window.innerWidth, window.innerHeight);
});
