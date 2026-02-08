/**
 * Blackjack Game Logic with Hi-Lo Card Counting
 */

class BlackjackGame {
  constructor() {
    this.deck = [];
    this.shoeSize = 2; // 2 decks
    this.shuffleThreshold = 0.25; // Shuffle when 25% cards left (75% used)
    this.actionDelay = 1100; // Delay for dealer narrations/actions in ms
    this.heroDelay = 500; // Delay for hero narrations/actions in ms

    this.balance = 200;
    this.runningCount = 0;

    this.dealerHand = [];
    this.playerHands = [[]]; // Array for split support
    this.currentHandIndex = 0;
    this.currentBet = 0;
    this.bets = [0];

    this.gameState = 'betting'; // betting, playing, resolved, busy
    this.isBusy = false;

    this.init();
  }

  init() {
    this.createShoe();
    this.cacheDOM();
    this.bindEvents();
    this.updateUI();
  }

  cacheDOM() {
    this.dom = {
      balance: document.getElementById('balance'),
      runningCount: document.getElementById('running-count'),
      trueCount: document.getElementById('true-count'),
      recBet: document.getElementById('rec-bet'),
      shoePen: document.getElementById('shoe-pen'),
      dealerCards: document.getElementById('dealer-cards'),
      dealerScore: document.getElementById('dealer-score'),
      playerCards: document.getElementById('player-cards'),
      playerScore: document.getElementById('player-score'),
      betAmount: document.getElementById('bet-amount'),
      dealBtn: document.getElementById('deal-btn'),
      hitBtn: document.getElementById('hit-btn'),
      standBtn: document.getElementById('stand-btn'),
      doubleBtn: document.getElementById('double-btn'),
      splitBtn: document.getElementById('split-btn'),
      recAction: document.getElementById('rec-action'),
      bettingControls: document.getElementById('betting-controls'),
      actionControls: document.getElementById('action-controls'),
      messageArea: document.getElementById('message-area')
    };
  }

  bindEvents() {
    this.dom.dealBtn.addEventListener('click', () => this.deal());
    this.dom.hitBtn.addEventListener('click', () => this.hit());
    this.dom.standBtn.addEventListener('click', () => this.stand());
    this.dom.doubleBtn.addEventListener('click', () => this.doubleDown());
    this.dom.splitBtn.addEventListener('click', () => this.split());

    // Spacebar shortcut
    window.addEventListener('keydown', (e) => {
      if (e.code === 'Space') {
        e.preventDefault(); // Prevent page scrolling
        this.handleSpaceShortcut();
      }
    });
  }

  handleSpaceShortcut() {
    if (this.isBusy) return;
    if (this.gameState === 'playing') {
      const action = this.getRecommendedAction();
      if (action === 'Hit' && !this.dom.hitBtn.disabled) this.hit();
      else if (action === 'Stand' && !this.dom.standBtn.disabled) this.stand();
      else if (action === 'Double' && !this.dom.doubleBtn.disabled) this.doubleDown();
      else if (action === 'Split' && !this.dom.splitBtn.disabled) this.split();
    } else if (this.gameState === 'resolved' || this.gameState === 'betting') {
      this.deal();
    }
  }

  async sleep(ms) {
    return new Promise(r => setTimeout(r, ms));
  }

  createShoe() {
    const suits = ['♠', '♣', '♥', '♦'];
    const values = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
    this.deck = [];

    for (let i = 0; i < this.shoeSize; i++) {
      for (let suit of suits) {
        for (let value of values) {
          this.deck.push({ suit, value });
        }
      }
    }
    this.shuffle();
    this.runningCount = 0; // Reset count on shuffle
  }

  shuffle() {
    for (let i = this.deck.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [this.deck[i], this.deck[j]] = [this.deck[j], this.deck[i]];
    }
  }

  getTrueCount() {
    const decksRemaining = Math.max(0.5, this.deck.length / 52);
    return (this.runningCount / decksRemaining).toFixed(2);
  }

  getRecommendedBet() {
    const tc = parseFloat(this.getTrueCount());
    const minBet = 1;
    if (tc <= 1) return minBet;
    // Standard spread: (TC - 1) * unit + minBet
    return minBet + (Math.floor(tc - 1) * 10);
  }

  updateCount(card) {
    const val = card.value;
    if (['2', '3', '4', '5', '6'].includes(val)) {
      this.runningCount++;
    } else if (['10', 'J', 'Q', 'K', 'A'].includes(val)) {
      this.runningCount--;
    }
  }

  getRecommendedAction() {
    if (this.gameState !== 'playing') return null;

    const hand = this.playerHands[this.currentHandIndex];
    const dealerUpCard = this.dealerHand[0];
    const playerScore = this.calculateScore(hand);
    const hasAce = hand.some(c => c.value === 'A') && playerScore <= 21;

    let dealerValue = parseInt(dealerUpCard.value);
    if (['J', 'Q', 'K'].includes(dealerUpCard.value)) dealerValue = 10;
    if (dealerUpCard.value === 'A') dealerValue = 11;

    const tc = parseFloat(this.getTrueCount());

    // Pair Splitting
    if (hand.length === 2 && hand[0].value === hand[1].value && this.balance >= this.currentBet) {
      const pair = hand[0].value;
      if (pair === 'A' || pair === '8') return 'Split';
      if (['2', '3', '7'].includes(pair) && dealerValue <= 7) return 'Split';
      if (pair === '4' && (dealerValue === 5 || dealerValue === 6)) return 'Split';
      if (pair === '6' && dealerValue <= 6) return 'Split';
      if (pair === '9' && dealerValue <= 9 && dealerValue !== 7) return 'Split';
    }

    // Soft Totals (Ace involved)
    if (hasAce && hand.length === 2) {
      if (playerScore >= 19) return 'Stand';
      if (playerScore === 18) {
        if (dealerValue <= 6) return 'Double';
        if (dealerValue <= 8) return 'Stand';
        return 'Hit';
      }
      if (dealerValue === 5 || dealerValue === 6) return 'Double';
      if (dealerValue === 4 && playerScore >= 15) return 'Double';
      return 'Hit';
    }

    // Hard Totals
    if (playerScore >= 17) return 'Stand';
    if (playerScore >= 13 && dealerValue <= 6) return 'Stand';
    if (playerScore === 12 && dealerValue >= 4 && dealerValue <= 6) return 'Stand';
    if (playerScore === 11) return 'Double';
    if (playerScore === 10 && dealerValue <= 9) return 'Double';
    if (playerScore === 9 && dealerValue >= 3 && dealerValue <= 6) return 'Double';

    // Illustrious 18 Index Plays (Simplified for TC)
    if (playerScore === 16 && dealerValue === 10 && tc >= 0) return 'Stand';
    if (playerScore === 15 && dealerValue === 10 && tc >= 4) return 'Stand';

    return 'Hit';
  }

  calculateScore(hand) {
    let score = 0;
    let aces = 0;
    for (let card of hand) {
      if (card.value === 'A') {
        aces++;
        score += 11;
      } else if (['J', 'Q', 'K'].includes(card.value)) {
        score += 10;
      } else {
        score += parseInt(card.value);
      }
    }
    while (score > 21 && aces > 0) {
      score -= 10;
      aces--;
    }
    return score;
  }

  deal() {
    const bet = parseInt(this.dom.betAmount.value);
    if (isNaN(bet) || bet <= 0 || bet > this.balance) {
      alert('Invalid bet amount');
      return;
    }

    this.roundStartingBalance = this.balance;

    if (this.deck.length < (52 * this.shoeSize * this.shuffleThreshold)) {
      this.createShoe();
      this.dom.messageArea.innerText = "Deck Shuffled!";
    } else {
      this.dom.messageArea.innerText = "";
    }
    this.dom.messageArea.className = 'status-message'; // Reset color to black (ongoing)

    this.balance -= bet;
    this.currentBet = bet;
    this.playerHands = [[]];
    this.dealerHand = [];
    this.currentHandIndex = 0;
    this.bets = [bet];

    // Initial deal
    this.playerHands[0].push(this.drawCard());
    this.dealerHand.push(this.drawCard());
    this.playerHands[0].push(this.drawCard());
    this.dealerHand.push(this.drawCard(false)); // Second card hidden

    this.gameState = 'playing';
    this.updateUI();

    // Check for natural Blackjack
    const playerScore = this.calculateScore(this.playerHands[0]);
    if (playerScore === 21) {
      this.stand();
    }
  }

  drawCard(visible = true) {
    const card = this.deck.pop();
    if (visible) this.updateCount(card);
    return card;
  }

  async hit() {
    if (this.isBusy) return;
    this.isBusy = true;
    const heroText = this.playerHands.length > 1 ? `Hero ${this.currentHandIndex + 1}` : 'Hero';
    this.dom.messageArea.innerText = `${heroText} chooses to Hit`;
    this.updateUI();

    await this.sleep(this.heroDelay);
    this.isBusy = false;

    const hand = this.playerHands[this.currentHandIndex];
    hand.push(this.drawCard());

    if (this.calculateScore(hand) >= 21) {
      await this.nextHand();
    } else {
      this.updateUI();
    }
  }

  async stand() {
    if (this.isBusy) return;
    this.isBusy = true;
    const heroText = this.playerHands.length > 1 ? `Hero ${this.currentHandIndex + 1}` : 'Hero';
    this.dom.messageArea.innerText = `${heroText} chooses to Stand`;
    this.updateUI();

    await this.sleep(this.heroDelay);
    this.isBusy = false;
    await this.nextHand();
  }

  async nextHand() {
    if (this.currentHandIndex < this.playerHands.length - 1) {
      this.currentHandIndex++;
      this.updateUI();
    } else {
      await this.dealerTurn();
    }
  }

  async doubleDown() {
    if (this.isBusy || this.balance < this.currentBet) return;
    this.isBusy = true;
    const heroText = this.playerHands.length > 1 ? `Hero ${this.currentHandIndex + 1}` : 'Hero';
    this.dom.messageArea.innerText = `${heroText} chooses to Double`;
    this.updateUI();

    await this.sleep(this.heroDelay);
    this.isBusy = false;

    const hand = this.playerHands[this.currentHandIndex];
    if (hand.length !== 2) return;

    this.balance -= this.currentBet;
    this.bets[this.currentHandIndex] *= 2;
    hand.push(this.drawCard());
    await this.nextHand();
  }

  async split() {
    if (this.isBusy) return;
    const hand = this.playerHands[this.currentHandIndex];
    if (hand.length !== 2 || hand[0].value !== hand[1].value || this.balance < this.currentBet) return;

    this.isBusy = true;
    const heroText = this.playerHands.length > 1 ? `Hero ${this.currentHandIndex + 1}` : 'Hero';
    this.dom.messageArea.innerText = `${heroText} chooses to Split`;
    this.updateUI();

    await this.sleep(this.heroDelay);
    this.isBusy = false;

    this.balance -= this.currentBet;
    const newHand = [hand.pop()];
    this.playerHands.push(newHand);
    this.bets.push(this.currentBet);

    // Draw one card for each
    hand.push(this.drawCard());
    newHand.push(this.drawCard());

    this.updateUI();
  }

  async dealerTurn() {
    this.gameState = 'dealer-turn';

    // Reveal hidden card
    this.updateCount(this.dealerHand[1]);
    this.dom.messageArea.innerText = "Dealer reveals";
    this.updateUI();
    await this.sleep(this.actionDelay);

    while (this.calculateScore(this.dealerHand) < 17) {
      this.dom.messageArea.innerText = "Dealer to act";
      await this.sleep(this.actionDelay);
      this.dom.messageArea.innerText = "Dealer chooses to Hit";
      await this.sleep(this.actionDelay);
      this.dealerHand.push(this.drawCard());
      this.updateUI();
    }

    this.dom.messageArea.innerText = "Dealer to act";
    await this.sleep(this.actionDelay);

    const score = this.calculateScore(this.dealerHand);
    if (score > 21) {
      this.dom.messageArea.innerText = "Dealer busts!";
      await this.sleep(this.actionDelay);
    } else {
      this.dom.messageArea.innerText = "Dealer chooses to Stand";
      await this.sleep(this.actionDelay);
    }

    this.resolveGame();
  }

  resolveGame() {
    const dealerScore = this.calculateScore(this.dealerHand);
    let results = [];

    this.playerHands.forEach((hand, index) => {
      const playerScore = this.calculateScore(hand);
      const bet = this.bets[index];
      const prefix = this.playerHands.length > 1 ? `Hero ${index + 1}: ` : '';
      let res = '';

      if (playerScore > 21) {
        res = 'Bust';
      } else if (dealerScore > 21) {
        this.balance += bet * 2;
        res = 'Win';
      } else if (playerScore > dealerScore) {
        this.balance += bet * 2;
        res = 'Win';
      } else if (playerScore < dealerScore) {
        res = 'Lose';
      } else {
        this.balance += bet;
        res = 'Push';
      }
      results.push(prefix + res);
    });

    this.gameState = 'resolved';
    const netChange = this.balance - this.roundStartingBalance;
    const changeSign = netChange >= 0 ? '+' : '';
    const message = results.join(' | ') + ` [${this.roundStartingBalance}${changeSign}${netChange}]`;
    this.dom.messageArea.innerHTML = message;

    if (message.includes('Win')) {
      this.dom.messageArea.className = 'status-message status-win';
    } else if (message.includes('Lose') || message.includes('Bust')) {
      this.dom.messageArea.className = 'status-message status-lose';
    } else if (message.includes('Push')) {
      this.dom.messageArea.className = 'status-message status-push';
    } else {
      this.dom.messageArea.className = 'status-message';
    }

    this.updateUI();
  }

  updateUI() {
    // Stats
    this.dom.balance.innerText = `$${this.balance}`;
    this.dom.runningCount.innerText = this.runningCount;
    this.dom.trueCount.innerText = this.getTrueCount();
    const recommendedBet = this.getRecommendedBet();
    this.dom.recBet.innerText = `$${recommendedBet}`;

    // Set the default bet in the input to the recommended one if in betting state
    if (this.gameState === 'resolved' || this.gameState === 'betting') {
      this.dom.betAmount.value = recommendedBet;
    }

    const cardsDealt = (this.shoeSize * 52) - this.deck.length;
    const totalCards = this.shoeSize * 52;
    this.dom.shoePen.innerText = `${Math.round((cardsDealt / totalCards) * 100)}%`;

    // Status message logic
    if (this.gameState === 'playing') {
      if (!this.isBusy) {
        const heroText = this.playerHands.length > 1 ? `Hero ${this.currentHandIndex + 1}` : 'Hero';
        this.dom.messageArea.innerText = `${heroText} to act`;
      }
      this.dom.messageArea.classList.remove('status-win', 'status-lose');
    } else if (this.gameState === 'dealer-turn') {
      // Message is managed explicitly in dealerTurn()
      this.dom.messageArea.classList.remove('status-win', 'status-lose');
    }

    // Hands
    this.renderHand(this.dom.dealerCards, this.dealerHand, this.gameState === 'playing');
    this.dom.dealerScore.innerText = `Score: ${this.gameState === 'playing' ? '?' : this.calculateScore(this.dealerHand)}`;

    // Player Hands
    const playerContainer = document.getElementById('player-hands-container');
    playerContainer.innerHTML = '';

    this.playerHands.forEach((hand, index) => {
      const handDiv = document.createElement('div');
      handDiv.className = `hand-section ${index === this.currentHandIndex && this.gameState === 'playing' ? 'active-hand' : ''}`;
      if (index === this.currentHandIndex && this.gameState === 'playing') {
        handDiv.style.border = '2px solid var(--gold)';
      }

      const label = document.createElement('span');
      label.className = 'hand-label';
      const labelText = this.playerHands.length > 1 ? `Hero ${index + 1}` : 'Hero';
      label.innerText = `${labelText} ($${this.bets[index]})`;
      handDiv.appendChild(label);

      const cardsDiv = document.createElement('div');
      cardsDiv.className = 'cards-display';
      this.renderHand(cardsDiv, hand);
      handDiv.appendChild(cardsDiv);

      const scoreDiv = document.createElement('div');
      scoreDiv.className = 'score-badge';
      scoreDiv.innerText = `Score: ${this.calculateScore(hand)}`;
      handDiv.appendChild(scoreDiv);

      playerContainer.appendChild(handDiv);
    });

    const recommendedAction = this.getRecommendedAction();
    this.dom.recAction.innerText = recommendedAction || '-';

    // Clear previous recommendations
    [this.dom.hitBtn, this.dom.standBtn, this.dom.doubleBtn, this.dom.splitBtn, this.dom.dealBtn].forEach(btn => {
      btn.classList.remove('btn-recommended');
    });

    // Controls
    const disabledByBusy = this.isBusy || this.gameState === 'dealer-turn';

    if (this.gameState === 'playing') {
      this.dom.bettingControls.style.display = 'none';
      this.dom.actionControls.style.display = 'flex';

      const currentHand = this.playerHands[this.currentHandIndex];
      const score = this.calculateScore(currentHand);

      this.dom.hitBtn.disabled = disabledByBusy || score >= 21;
      this.dom.standBtn.disabled = disabledByBusy;
      this.dom.doubleBtn.disabled = disabledByBusy || currentHand.length !== 2 || this.balance < this.currentBet;
      this.dom.splitBtn.style.display = (currentHand.length === 2 && currentHand[0].value === currentHand[1].value && this.balance >= this.currentBet) ? 'inline-block' : 'none';
      this.dom.splitBtn.disabled = disabledByBusy;

      // Highlight recommendation
      if (!disabledByBusy) {
        if (recommendedAction === 'Hit') this.dom.hitBtn.classList.add('btn-recommended');
        if (recommendedAction === 'Stand') this.dom.standBtn.classList.add('btn-recommended');
        if (recommendedAction === 'Double') this.dom.doubleBtn.classList.add('btn-recommended');
        if (recommendedAction === 'Split') this.dom.splitBtn.classList.add('btn-recommended');
      }
    } else if (this.gameState === 'resolved') {
      this.dom.bettingControls.style.display = 'block';
      this.dom.actionControls.style.display = 'none';
      this.dom.dealBtn.disabled = this.isBusy;
      if (!this.isBusy) this.dom.dealBtn.classList.add('btn-recommended');
    } else {
      this.dom.actionControls.style.display = 'none';
      this.dom.dealBtn.disabled = this.isBusy;
      if (!this.isBusy) this.dom.dealBtn.classList.add('btn-recommended');
    }
  }

  renderHand(container, hand, hideSecond = false) {
    container.innerHTML = '';
    hand.forEach((card, index) => {
      const cardEl = document.createElement('div');
      cardEl.className = `card ${['♥', '♦'].includes(card.suit) ? 'red' : ''}`;
      if (hideSecond && index === 1) {
        cardEl.classList.add('hidden');
        cardEl.innerHTML = `<div style="height:100%; display:flex; align-items:center; justify-content:center; color:rgba(255,255,255,0.2)">?</div>`;
      } else {
        cardEl.innerHTML = `<div>${card.value}</div><div style="align-self: flex-end">${card.suit}</div>`;
      }
      container.appendChild(cardEl);
    });
  }
}

// Start the game
window.onload = () => {
  new BlackjackGame();
};
