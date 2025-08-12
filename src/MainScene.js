export default class MainScene extends Phaser.Scene {
  constructor() {
    super('MainScene');
    this.maxPlaysPerDay = 3;
    this.playsKey = 'pharos_game_plays';
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

    // Background
    this.add.image(width / 2, height / 2, 'sky').setDisplaySize(width, height);

    // Water at bottom
    this.water = this.add.image(width / 2, height, 'water').setOrigin(0.5, 1);
    this.water.setDisplaySize(width, this.water.height);

    this.groundLevel = this.water.y - this.water.displayHeight;

    // Lighthouse on the right
    this.lighthouse = this.physics.add.staticImage(width - 100, this.groundLevel, 'lighthouse')
      .setOrigin(0.5, 0.65)
      .setDisplaySize(150, 450);
    this.lighthouse.refreshBody();

    // Player on the left
    this.player = this.physics.add.sprite(50, this.groundLevel, 'player')
      .setOrigin(0.5, 1)
      .setScale(0.2);
    this.player.setCollideWorldBounds(true);
    this.player.body.setGravityY(900);

    // Waves group
    this.beams = this.physics.add.group();

    // Collision with waves => restart or lose
    this.physics.add.overlap(this.player, this.beams, () => {
      this.handleLose();
    });

    // Collision with lighthouse => win
    this.physics.add.overlap(this.player, this.lighthouse, () => {
      this.handleWin();
    });

    // Input keys
    this.cursors = this.input.keyboard.createCursorKeys();
    this.keys = this.input.keyboard.addKeys({
      left: Phaser.Input.Keyboard.KeyCodes.A,
      right: Phaser.Input.Keyboard.KeyCodes.D,
      space: Phaser.Input.Keyboard.KeyCodes.SPACE
    });

    // Plays counter & message text
    this.plays = this.loadPlays();
    this.messageText = this.add.text(10, 10, '', { fontSize: '20px', fill: '#ffffff' });

    // Show plays left at start
    this.updatePlaysMessage();

    // Timer for waves spawning
    this.time.addEvent({
      delay: 1000,
      callback: this.spawnWave,
      callbackScope: this,
      loop: true
    });
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
    return d.getFullYear() + '-' + (d.getMonth()+1) + '-' + d.getDate();
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
  const waveY = waveHeights[Phaser.Math.Between(0, waveHeights.length -1)];

  let wave = this.beams.create(this.lighthouse.x - 250, waveY, 'beam')
    .setOrigin(0.05, 0.1)
    .setScale(Phaser.Math.FloatBetween(0.05, 0.2));

  wave.setVelocityX(-250);
  wave.body.setAllowGravity(false); // еще раз на всякий

  // Удаление при выходе за экран
  wave.setCollideWorldBounds(false);
  wave.body.onWorldBounds = true;
  wave.body.world.on('worldbounds', (body) => {
    if (body.gameObject === wave) {
      wave.destroy();
    }
  });
}

  update() {
    const speed = 150;
    const player = this.player;

    player.setVelocityX(0);

    if (this.cursors.left.isDown || this.keys.left.isDown) {
      player.setVelocityX(-speed);
    } else if (this.cursors.right.isDown || this.keys.right.isDown) {
      player.setVelocityX(speed);
    }

    // Прыжок пробелом
    if (Phaser.Input.Keyboard.JustDown(this.keys.space) && player.body.onFloor()) {
      player.setVelocityY(-900);
    }

    // Чистим волны, вышедшие за экран слева
    this.beams.getChildren().forEach(wave => {
      if (wave.x < -wave.displayWidth) {
        wave.destroy();
      }
    });
  }
}
