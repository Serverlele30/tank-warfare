# 🎮 Tank Warfare

A real-time multiplayer tank battle game with adaptive AI opponents. Battle against players and smart bots in an ever-evolving arena!

![Tank Warfare](https://img.shields.io/badge/Status-Live-brightgreen) 
![Node.js](https://img.shields.io/badge/Node.js-14+-green)
![License](https://img.shields.io/badge/License-MIT-blue)

## ✨ Features

### 🎯 Gameplay
- **Real-time Multiplayer** - Fight against real players worldwide
- **Adaptive AI** - Bots get smarter as players improve
- **Free-for-All PvP** - Everyone fights everyone (including bots)
- **Power-Ups** - Health, Shield, and Speed boosts
- **Respawn System** - Keep fighting with spawn protection
- **Dynamic Leaderboard** - Track your rank in real-time

### 🤖 Intelligent Bots
- **3 Strategies**: Aggressive, Defensive, and Balanced
- **Difficulty Scaling**: Adapts based on average player score
- **Target Leading**: Predicts player movement
- **Smart Positioning**: Maintains optimal combat distance
- **Resource Management**: Prioritizes health when low

### 🎨 Visual Features
- **Responsive Design** - Adapts to any screen size
- **1500x1500 Battle Arena** - Large map with 4 colored zones
- **Minimap** - Always know where the action is
- **Smooth Animations** - Particle effects and visual feedback
- **Sound Effects** - Web Audio API powered sounds

### 🎮 Controls
- **Mouse Movement** - Tank follows your cursor
- **Left Click** - Fire weapons
- **ESC** - Pause menu
- **Click UI** - Interactive leaderboard and minimap

## 🚀 Quick Start

### Local Development

```bash
# Clone the repository
git clone https://github.com/Serverlele30/tank-warfare.git
cd tank-warfare

# Install dependencies
npm install

# Start the server
npm start

# Open your browser
open http://localhost:3000
```

### Development Mode (with auto-reload)

```bash
npm run dev
```

## 🌐 Deploy to Vercel

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https://github.com/Serverlele30/tank-warfare)

### Manual Deployment

1. Install Vercel CLI:
```bash
npm i -g vercel
```

2. Deploy:
```bash
vercel
```

3. Follow the prompts!

## 📁 Project Structure

```
tank-warfare/
├── server.js              # Node.js server with game logic
├── public/
│   └── index.html         # Game client
├── package.json           # Dependencies
├── vercel.json            # Vercel configuration
├── .gitignore            # Git ignore rules
├── LICENSE               # MIT License
└── README.md             # This file
```

## ⚙️ Configuration

Edit `server.js` to customize:

```javascript
const WORLD_WIDTH = 1500;      // Map width
const WORLD_HEIGHT = 1500;     // Map height
const MAX_BOTS = 6;            // Maximum number of bots
const TICK_RATE = 60;          // Server updates per second
```

## 🎯 Game Mechanics

### Scoring
- **Kill**: +100 points
- **Hit**: Points based on damage
- **Death**: Respawn with 3s shield protection

### Bot Difficulty
Bots adapt based on player performance:
- **Easy** (0-250 avg score): Slow reactions, poor aim
- **Medium** (250-500 avg score): Balanced gameplay
- **Hard** (500-1000 avg score): Fast, accurate, strategic
- **Very Hard** (1000+ avg score): Near-perfect aim and positioning

### Power-Ups
- ❤️ **Health** (+50 HP)
- 🛡️ **Shield** (5s invulnerability)
- ⚡ **Speed** (+50% speed for 5s)

## 🔧 Tech Stack

- **Frontend**: HTML5 Canvas, Vanilla JavaScript, Socket.io Client
- **Backend**: Node.js, Express, Socket.io
- **Deployment**: Vercel
- **Audio**: Web Audio API

## 🐛 Troubleshooting

### Port already in use
```bash
PORT=3001 npm start
```

### Connection issues
- Check firewall settings
- Ensure port 3000 is open
- Try using `localhost` instead of `127.0.0.1`

### Bots not spawning
- Check `MAX_BOTS` in server.js
- Verify server console for errors

## 🤝 Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

1. Fork the project
2. Create your feature branch (`git checkout -b feature/AmazingFeature`)
3. Commit your changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

## 📝 TODO

- [ ] Team modes (2v2, 3v3)
- [ ] More weapon types
- [ ] Obstacles and terrain
- [ ] Account system with stats
- [ ] Mobile touch controls
- [ ] Tournament mode
- [ ] Map editor
- [ ] Custom skins

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🙏 Acknowledgments

- Inspired by classic tank games and modern .io games
- Built with ❤️ for the gaming community
- Special thanks to all contributors and players!

## 📊 Stats

- **Average Game Duration**: 5-10 minutes
- **Max Players**: Unlimited (server dependent)
- **Bot AI Complexity**: 3 strategies × adaptive difficulty
- **Update Rate**: 60 ticks per second

## 🎮 Play Now!

[Live Demo](https://tank-warfare.vercel.app)

---

Made with 🎯 and ☕ | [Report Bug](https://github.com/Serverlele30/tank-warfare/issues) | [Request Feature](https://github.com/Serverlele30/tank-warfare/issues)
