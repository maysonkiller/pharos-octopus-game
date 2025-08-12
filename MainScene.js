class MainScene extends Phaser.Scene {
  constructor() {
    super('MainScene');
    this.maxPlaysPerDay = 3;
    this.playsKey = 'pharos_game_plays';

    // Для кошелька
    this.provider = null;
    this.signer = null;
    this.walletAddress = null;

    this.tokenAddress = '0xdd051eab9b0b74de4f149975feb8b585c7ca037e';
    this.erc20Abi = [
      "function transfer(address to, uint amount) returns (bool)",
      "function balanceOf(address) view returns (uint)"
    ];
  }

  preload() {
    this.load.image('sky', 'assets/sky.png');
    this.load.image('water', 'assets/water.png');
    this.load.image('player', 'assets/sticker.webp');
    this.load.image('lighthouse', 'assets/lighthouse.png');
    this.load.image('beam', 'assets/beam.webp'); // волны
  }

  create() {
    const width = this.sys.game.config.width;
    const height = this.sys.game.config.height;

    this.add.image(width / 2, height / 2, 'sky').setDisplaySize(width, height);

    this.water = this.add.image(width / 2, height, 'water').setOrigin(0.5, 1);
    this.water.setDisplaySize(width, this.water.height);

    this.groundLevel = this.water.y - this.water.displayHeight;

    this.lighthouse = this.physics.add.staticImage(width - 100, this.groundLevel, 'lighthouse')
      .setOrigin(0.5, 0.65)
      .setDisplaySize(150, 450);
    this.lighthouse.refreshBody();

    this.player = this.physics.add.sprite(50, this.groundLevel, 'player')
      .setOrigin(0.5, 1)
      .setScale(0.2);
    this.player.setCollideWorldBounds(true);
    this.player.body.setGravityY(900);

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

    this.plays = this.loadPlays();
    this.messageText = this.add.text(10, 10, '', { fontSize: '20px', fill: '#ffffff' });
    this.updatePlaysMessage();

    this.connectButton = this.add.text(10, 50, 'Connect Wallet', { fontSize: '20px', fill: '#00ff00' })
      .setInteractive()
      .on('pointerdown', () => this.connectWallet());

    this.walletText = this.add.text(10, 80, 'Wallet: Not connected', { fontSize: '16px', fill: '#ffffff' });

    // Текст баланса токенов
    this.balanceText = this.add.text(10, 140, 'Balance: -', { fontSize: '16px', fill: '#ffff00' });

    // Кнопка Start Game
    this.startButton = this.add.text(10, 110, 'Start Game', { fontSize: '20px', fill: '#00ffff' })
      .setInteractive()
      .on('pointerdown', async () => {
        if (this.plays >= this.maxPlaysPerDay) {
          this.updatePlaysMessage('No plays left today.');
          return;
        }
        if (!this.walletAddress) {
          this.updatePlaysMessage('Please connect your wallet first.');
          return;
        }
        const paid = await this.payStake();
        if (paid) {
          await this.updateBalance();  // обновляем баланс после оплаты
          this.scene.restart(); // Перезапускаем сцену, игра начинается
        }
      });

    this.gameStarted = false;
    this.countdownText = this.add.text(width / 2, height / 2, 'Press Space to Start', { fontSize: '32px', fill: '#ffffff' }).setOrigin(0.5);
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
    if (window.ethereum) {
      try {
        await window.ethereum.request({ method: 'eth_requestAccounts' });
        await this.switchToPharos();

        this.provider = new window.ethers.providers.Web3Provider(window.ethereum);
        this.signer = this.provider.getSigner();
        this.walletAddress = await this.signer.getAddress();
        this.walletText.setText(`Wallet: ${this.walletAddress.slice(0, 6)}...${this.walletAddress.slice(-4)}`);
        await this.updateBalance(); // обновляем баланс при подключении кошелька
        console.log('Connected wallet:', this.walletAddress);

        // Следим за изменением сети (например, если пользователь переключит вручную)
        window.ethereum.on('chainChanged', async (chainId) => {
          if (chainId !== '0xa8230') {  // если не Pharos, предлагаем переключиться
            this.updatePlaysMessage('Please switch to Pharos Network.');
          } else {
            await this.updateBalance();
            this.updatePlaysMessage();
          }
        });

      } catch (error) {
        console.error('User rejected wallet connection or network switch:', error);
        this.updatePlaysMessage('Wallet connection or network switch failed.');
      }
    } else {
      alert('Please install MetaMask or another Ethereum wallet.');
    }
  }

  async switchToPharos() {
    if (!window.ethereum) return;
    try {
      await window.ethereum.request({
        method: 'wallet_switchEthereumChain',
        params: [{ chainId: '0xa8230' }]  // Chain ID Pharos Testnet в hex (688688 dec)
      });
    } catch (error) {
      // Если сеть не добавлена в MetaMask, добавляем её
      if (error.code === 4902) {
        try {
          await window.ethereum.request({
            method: 'wallet_addEthereumChain',
            params: [{
              chainId: '0xa8230',
              chainName: 'Pharos Testnet',
              nativeCurrency: {
                name: 'Pharos',
                symbol: 'PHAROS',
                decimals: 18
              },
              rpcUrls: ['http://testnet.dplabs-internal.com'],
              blockExplorerUrls: ['http://testnet.pharosscan.xyz']
            }]
          });
          // После добавления пробуем переключиться снова
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
    const bankAddress = '0x6EC8C121043357aC231E36D403EdAbf90AE6989B';
    const stakeAmount = ethers.utils.parseUnits('0.01', 18); // 0.01 токен

    if (!this.signer) {
      this.updatePlaysMessage('Please connect your wallet first');
      return false;
    }

    try {
      const tokenContract = new ethers.Contract(this.tokenAddress, this.erc20Abi, this.signer);
      const balance = await tokenContract.balanceOf(this.walletAddress);
      if (balance.lt(stakeAmount)) {
        this.updatePlaysMessage('Insufficient token balance for stake.');
        return false;
      }

      this.updatePlaysMessage('Sending stake payment...');
      const tx = await tokenContract.transfer(bankAddress, stakeAmount);
      await tx.wait();
      this.updatePlaysMessage('Stake payment successful! Starting game...');
      return true;
    } catch (err) {
      console.error(err);
      this.updatePlaysMessage('Stake payment failed: ' + err.message);
      return false;
    }
  }

  async updateBalance() {
    if (!this.signer || !this.walletAddress) {
      this.balanceText.setText('Balance: -');
      return;
    }

    try {
      const tokenContract = new ethers.Contract(this.tokenAddress, this.erc20Abi, this.provider);
      const balanceRaw = await tokenContract.balanceOf(this.walletAddress);
      const balance = ethers.utils.formatUnits(balanceRaw, 18);
      this.balanceText.setText(`Balance: ${balance} Pharos`);
    } catch (error) {
      console.error('Failed to fetch balance:', error);
      this.balanceText.setText(`Balance: error - ${error.message}`);
    }
  }

  loadPlays() {
    const saved = localStorage.getItem(this.playsKey);
    if (!saved) {
      localStorage.setItem(this.playsKey, JSON.stringify({ date: this.getToday(), count: 0 }));
      return 0;
    }
    const data = JSON.parse(saved);
    if (data.date !== this.getToday()) {
      localStorage.setItem(this.playsKey, JSON.stringify({ date: this.getToday(), count: 0 }));
      return 0;
    }
    return data.count;
  }

  incrementPlays() {
    let data = JSON.parse(localStorage.getItem(this.playsKey));
    data.count++;
    localStorage.setItem(this.playsKey, JSON.stringify(data));
    this.plays = data.count;
  }

  getToday() {
    const d = new Date();
    return d.getFullYear() + '-' + (d.getMonth() + 1) + '-' + d.getDate();
  }

  updatePlaysMessage(text) {
    if (text) {
      this.messageText.setText(text);
    } else {
      const left = this.maxPlaysPerDay - this.plays;
      this.messageText.setText(`Plays left today: ${left}`);
    }
  }

  handleLose() {
    this.incrementPlays();
    if (this.plays >= this.maxPlaysPerDay) {
      this.updatePlaysMessage('No plays left today. Please come back tomorrow.');
      this.physics.pause();
      this.time.removeAllEvents();
      return;
    }
    this.updatePlaysMessage('You lost! Try again.');
    this.scene.restart();
  }

  handleWin() {
    this.incrementPlays();
    this.updatePlaysMessage('Congratulations! You got 0.1 Pharos.');
    this.physics.pause();
    this.time.removeAllEvents();
  }

  spawnWave() {
    const waveHeights = [150, 250, 350, 450, 550];
    const waveY = waveHeights[Phaser.Math.Between(0, waveHeights.length - 1)];

    let wave = this.beams.create(this.lighthouse.x - 250, waveY, 'beam')
      .setOrigin(0.05, 0.1)
      .setScale(Phaser.Math.FloatBetween(0.05, 0.2));

    wave.setVelocityX(-250);
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
    const speed = 200;
    const player = this.player;

    if (this.gameStarted) {
      player.setVelocityX(0);

      if (this.cursors.left.isDown || this.keys.left.isDown) {
        player.setVelocityX(-speed);
      } else if (this.cursors.right.isDown || this.keys.right.isDown) {
        player.setVelocityX(speed);
      }

      if (Phaser.Input.Keyboard.JustDown(this.keys.space) && player.body.onFloor()) {
        player.setVelocityY(-900);
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