class MainScene extends Phaser.Scene {
  constructor() {
    super('MainScene');

    this.provider = null;
    this.signer = null;
    this.walletAddress = null;

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
      delay: 1500, // Увеличен для снижения нагрузки
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
                name: 'Pharos',
                symbol: 'PHRS',
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
      const balance = await this.provider.getBalance(this.walletAddress);
      console.log('Balance raw:', balance.toString());

      if (balance.lt(stakeAmount)) {
        this.updateMessage('Insufficient PHRS balance for stake.');
        return false;
      }

      this.updateMessage('Sending stake payment...');
      const tx = await this.signer.sendTransaction({
        to: this.depositAddress,
        value: stakeAmount
      });
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
      const balanceRaw = await this.provider.getBalance(this.walletAddress);
      console.log('Fetched raw balance:', balanceRaw.toString());
      const balance = ethers.utils.formatUnits(balanceRaw, 18);
      this.balanceText.setText(`Balance: ${balance} PHRS...
