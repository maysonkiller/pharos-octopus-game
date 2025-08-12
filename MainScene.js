export default class MainScene extends Phaser.Scene {
  constructor() {
    super('MainScene');

    this.provider = null;
    this.signer = null;
    this.walletAddress = null;
    this.jumpCount = 0; // Для двойного прыжка

    this.tokenAddress = '0x3019B247381c850ab53Dc0EE53bCe7A07Ea9155f';
    this.erc20Abi = [
      "function balanceOf(address) view returns (uint)",
      "function transfer(address to, uint amount) returns (bool)"
    ];

    this.depositAddress = '0x6EC8C121043357aC231E36D403EdAbf90AE6989B';
  }

  preload() {
    this.load.image('sky', 'assets/sky.png');
    this.load.image('water', 'assets/water.png');
    this.load.image('player', 'assets/sticker.webp');
    this.load.image('lighthouse', 'assets/lighthouse.png');
    this.load.image('beam', 'assets/beam.webp');
    this.load.audio('waves', 'assets/waves.mp3'); // Звук волн
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
      fill: '#00FFFF' // Бирюзовый цвет
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
    this.sound.play('waves', { loop: true, volume: 0.5 }); // Проигрываем звук волн
    this.time.addEvent({
      delay: 2000, // Увеличен для снижения нагрузки
      callback: this.spawnWave,
      callbackScope: this,
      loop: true
    });
  }

  async connectWallet() {
    if (!window.ethereum || !window.ethereum.isMetaMask) {
      alert('Please install MetaMask and disable other wallet extensions (e.g., Phantom).');
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
      this.updateMessage('Wallet connection or network switch failed: ' + error.message);
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
          console.error('Failed to add Pharos Testnet:', addError);
          this.updateMessage('Failed to add Pharos Testnet.');
        }
      } else {
        console.error('Switch to Pharos failed:', error);
        this.updateMessage('Failed to switch to Pharos Network.');
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

  async claimReward() {
    const rewardAmount = ethers.utils.parseUnits('0.01', 18);

    if (!this.signer) {
      this.updateMessage('Please connect your wallet first');
      return;
    }

    try {
      const tokenContract = new ethers.Contract(this.tokenAddress, this.erc20Abi, this.signer);
      const balance = await tokenContract.balanceOf(this.depositAddress);
      console.log('Deposit address balance:', balance.toString());

      if (balance.lt(rewardAmount)) {
        this.updateMessage('Insufficient WPHRS on deposit address for reward.');
        return;
      }

      this.updateMessage('Claiming 0.01 WPHRS...');
      const tx = await tokenContract.transfer(this.walletAddress, rewardAmount);
      console.log('Claim transaction sent:', tx.hash);
      await tx.wait();
      this.updateMessage('Reward claimed successfully!');
      await this.updateBalance();
    } catch (err) {
      console.error('Claim reward failed:', err);
      this.updateMessage('Claim failed: ' + (err.data?.message || err.message || err));
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
    this.physics.pause();
    this.time.removeAllEvents();
    const width = this.scale.width;
    const height = this.scale.height;

    this.updateMessage('Congratulations! Claim your reward.');
    this.claimButton = this.add.text(width / 2, height / 2, 'Claim 0.01 WPHRS', {
      fontSize: Math.min(width, height) * 0.05 + 'px',
      fill: '#00ff00'
    })
      .setOrigin(0.5)
      .setInteractive()
      .on('pointerdown', () => this.claimReward());
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

      if (Phaser.Input.Keyboard.JustDown(this.keys.space) && this.jumpCount < 2) {
        player.setVelocityY(-900 * (this.scale.height / 600));
        this.jumpCount++;
      }

      if (player.body.onFloor()) {
        this.jumpCount = 0;
      }
    } else {
      if (Phaser.Input.Keyboard.JustDown(this.keys.space)) {
        if (!this.walletAddress) {
          this.updateMessage('Please connect your wallet first.');
          return;
        }
        this.payStake().then((paid) => {
          if (paid) {
            this.updateBalance().then(() => {
              this.startCountdown();
            });
          }
        });
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
