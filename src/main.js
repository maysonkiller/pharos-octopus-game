import Phaser from 'phaser';
import MainScene from './MainScene.js';

if (!window.gameInstance) {
  const config = {
    type: Phaser.AUTO,
    width: 800,
    height: 600,
    parent: 'game-container',
    backgroundColor: '#0b1220',
    physics: {
      default: 'arcade',
      arcade: {
        gravity: { y: 1000 },
        debug: false
      }
    },
    scene: [MainScene]
  };

  window.gameInstance = new Phaser.Game(config);
} else {
  console.log('Game instance already exists, skipping creation.');
}
