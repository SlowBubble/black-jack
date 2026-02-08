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

    const urlParams = new URLSearchParams(window.location.search);
    this.numbersOnly = urlParams.get('numbers_only') === '1';
    this.pauseDealer = urlParams.get('pause_dealer') === '1';

    this.voice = null;
    this.waitingForSpace = false;
    this.spaceResolver = null;

    this.initVoice();
    this.init();
  }

  initVoice() {
    const findVoice = () => {
      const voices = window.speechSynthesis.getVoices();
      // Try to find a British male voice
      this.voice = voices.find(v => (v.lang === 'en-GB' || v.lang === 'en_GB') && v.name.toLowerCase().includes('male'))
        || voices.find(v => v.lang.includes('GB') && v.name.toLowerCase().includes('male'))
        || voices.find(v => (v.lang === 'en-GB' || v.lang === 'en_GB'))
        || voices.find(v => v.lang.includes('GB'))
        || voices.find(v => v.lang.includes('en'))
        || voices[0];
    };
    if ('speechSynthesis' in window) {
      if (window.speechSynthesis.onvoiceschanged !== undefined) {
        window.speechSynthesis.onvoiceschanged = findVoice;
      }
      findVoice();
    }
  }

  async speak(text) {
    if (!('speechSynthesis' in window)) return;

    // Cancel any ongoing speech
    window.speechSynthesis.cancel();

    return new Promise((resolve) => {
      const utterance = new SpeechSynthesisUtterance(text);
      if (this.voice) utterance.voice = this.voice;
      utterance.rate = 1.0;
      utterance.pitch = 1.0;

      utterance.onend = () => resolve();
      utterance.onerror = (e) => {
        console.error('SpeechSynthesis error', e);
        resolve();
      };

      window.speechSynthesis.speak(utterance);

      // Safety timeout in case onend never fires
      setTimeout(resolve, 8000);
    });
  }

  getCardName(card) {
    const val = card.value;
    if (val === 'A' || val === '1') return 'Ace';
    if (val === 'J') return 'Jack';
    if (val === 'Q') return 'Queen';
    if (val === 'K') return 'King';
    return val;
  }

  getCardNarrative(card) {
    const name = this.getCardName(card);
    const article = (name === 'Ace' || name === '8') ? 'an' : 'a';
    return `${article} ${name}`;
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
      proceedBtn: document.getElementById('proceed-btn'),
      messageArea: document.getElementById('message-area')
    };
  }

  bindEvents() {
    this.dom.dealBtn.addEventListener('click', async () => await this.deal());
    this.dom.hitBtn.addEventListener('click', () => this.hit());
    this.dom.standBtn.addEventListener('click', () => this.stand());
    this.dom.doubleBtn.addEventListener('click', () => this.doubleDown());
    this.dom.splitBtn.addEventListener('click', () => this.split());
    this.dom.proceedBtn.addEventListener('click', () => this.handleProceed());

    // Spacebar shortcut
    window.addEventListener('keydown', (e) => {
      if (e.code === 'Space') {
        e.preventDefault(); // Prevent page scrolling
        this.handleSpaceShortcut();
      }
    });
  }

  async handleSpaceShortcut() {
    if (this.isBusy) {
      if (this.waitingForSpace) {
        this.handleProceed();
      }
      return;
    }
    if (this.gameState === 'playing') {
      const action = this.getRecommendedAction();
      if (action === 'Hit' && !this.dom.hitBtn.disabled) this.hit();
      else if (action === 'Stand' && !this.dom.standBtn.disabled) this.stand();
      else if (action === 'Double' && !this.dom.doubleBtn.disabled) this.doubleDown();
      else if (action === 'Split' && !this.dom.splitBtn.disabled) this.split();
    } else if (this.gameState === 'resolved' || this.gameState === 'betting') {
      await this.deal();
    }
  }

  handleProceed() {
    if (this.waitingForSpace && this.spaceResolver) {
      const resolve = this.spaceResolver;
      this.spaceResolver = null;
      this.waitingForSpace = false;
      this.updateUI(); // Hide button via updateUI
      resolve();
    }
  }

  async waitForSpace() {
    if (!this.pauseDealer) return;
    this.waitingForSpace = true;
    this.updateUI(); // Show button via updateUI
    return new Promise(resolve => {
      this.spaceResolver = resolve;
    });
  }

  async sleep(ms) {
    return new Promise(r => setTimeout(r, ms));
  }

  createShoe() {
    const suits = ['♠', '♣', '♥', '♦'];
    const values = this.numbersOnly
      ? ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', '10', '10', '10']
      : ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
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
    } else if (['10', 'J', 'Q', 'K', 'A', '1'].includes(val)) {
      this.runningCount--;
    }
  }

  getRecommendedAction() {
    if (this.gameState !== 'playing') return null;

    const hand = this.playerHands[this.currentHandIndex];
    const dealerUpCard = this.dealerHand[0];
    const playerScore = this.calculateScore(hand);
    const hasAce = hand.some(c => c.value === '1' || c.value === 'A') && playerScore <= 21;

    let dealerValue = parseInt(dealerUpCard.value);
    if (['J', 'Q', 'K'].includes(dealerUpCard.value)) dealerValue = 10;
    if (dealerUpCard.value === '1' || dealerUpCard.value === 'A') dealerValue = 11;

    const tc = parseFloat(this.getTrueCount());

    // Pair Splitting
    if (hand.length === 2 && hand[0].value === hand[1].value && this.balance >= this.currentBet) {
      const pair = hand[0].value;
      if (pair === '1' || pair === 'A' || pair === '8') return 'Split';
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
      if (card.value === '1' || card.value === 'A') {
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

  getScoreDisplay(hand) {
    let lowScore = 0;
    let aces = 0;
    for (let card of hand) {
      if (card.value === '1' || card.value === 'A') {
        aces++;
        lowScore += 1;
      } else if (['J', 'Q', 'K'].includes(card.value)) {
        lowScore += 10;
      } else {
        lowScore += parseInt(card.value);
      }
    }

    if (aces === 0) return lowScore.toString();

    let highScore = lowScore + 10;
    if (highScore <= 21) {
      return `${lowScore} / ${highScore}`;
    } else {
      return lowScore.toString();
    }
  }

  async deal() {
    if (this.isBusy) return;
    const bet = parseInt(this.dom.betAmount.value);
    if (isNaN(bet) || bet <= 0 || bet > this.balance) {
      alert('Invalid bet amount');
      return;
    }

    this.isBusy = true;
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
    const p1 = this.drawCard();
    const d1 = this.drawCard();
    const p2 = this.drawCard();
    const d2 = this.drawCard(false); // Second card hidden

    this.playerHands[0].push(p1);
    this.dealerHand.push(d1);
    this.playerHands[0].push(p2);
    this.dealerHand.push(d2);

    this.gameState = 'playing';
    this.updateUI();

    await this.speak(`You are dealt ${this.getCardNarrative(p1)} and ${this.getCardNarrative(p2)}.`);

    this.isBusy = false;
    this.updateUI();

    // Check for natural Blackjack
    const playerScore = this.calculateScore(this.playerHands[0]);
    if (playerScore === 21) {
      await this.stand();
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

    const hand = this.playerHands[this.currentHandIndex];
    const card = this.drawCard();
    hand.push(card);
    this.updateUI();

    await this.speak(`You are dealt ${this.getCardNarrative(card)}.`);

    const score = this.calculateScore(hand);
    if (score > 21) {
      await this.speak(`You bust because the score is ${score}, which is greater than 21.`);
    }

    this.isBusy = false;

    if (score >= 21) {
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

    const score = this.calculateScore(this.playerHands[this.currentHandIndex]);
    await this.speak(`You stand with a score of ${score}.`);

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

    const hand = this.playerHands[this.currentHandIndex];
    if (hand.length !== 2) {
      this.isBusy = false;
      return;
    }

    this.balance -= this.currentBet;
    this.bets[this.currentHandIndex] *= 2;
    const card = this.drawCard();
    hand.push(card);
    this.updateUI();

    const score = this.calculateScore(hand);
    await this.speak(`You double down with a score of ${score}.`);

    if (score > 21) {
      await this.speak(`You bust because the score is ${score}, which is greater than 21.`);
    }

    this.isBusy = false;
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

    this.balance -= this.currentBet;
    const newHand = [hand.pop()];
    this.playerHands.push(newHand);
    this.bets.push(this.currentBet);

    // Draw one card for each
    hand.push(this.drawCard());
    newHand.push(this.drawCard());

    this.updateUI();

    const score1 = this.calculateScore(hand);
    const score2 = this.calculateScore(newHand);
    await this.speak(`You split with a score of ${score1} for hand 1 and ${score2} for hand 2.`);

    this.isBusy = false;
    this.updateUI();
  }

  async dealerTurn() {
    this.gameState = 'dealer-turn';
    this.isBusy = true;

    await this.waitForSpace();

    // Reveal hidden card
    const hiddenCard = this.dealerHand[1];
    this.updateCount(hiddenCard);
    this.dom.messageArea.innerText = "Dealer reveals";
    this.updateUI();
    await this.speak(`The dealer reveals ${this.getCardNarrative(hiddenCard)}.`);

    while (this.calculateScore(this.dealerHand) < 17) {
      await this.waitForSpace();
      this.dom.messageArea.innerText = "Dealer chooses to Hit";
      const card = this.drawCard();
      this.dealerHand.push(card);
      this.updateUI();
      await this.speak(`The dealer hits and is dealt ${this.getCardNarrative(card)}.`);
    }

    await this.waitForSpace();
    const score = this.calculateScore(this.dealerHand);
    if (score > 21) {
      this.dom.messageArea.innerText = "Dealer busts!";
      await this.speak(`Dealer busts because the score is ${score}, which is greater than 21.`);
    } else {
      this.dom.messageArea.innerText = "Dealer chooses to Stand";
      await this.speak(`The dealer stands with a score of ${score}.`);
    }

    await this.waitForSpace();
    await this.resolveGame();
    this.isBusy = false;
  }

  async resolveGame() {
    const dealerScore = this.calculateScore(this.dealerHand);
    let results = [];
    let narrations = [];

    for (let index = 0; index < this.playerHands.length; index++) {
      const hand = this.playerHands[index];
      const playerScore = this.calculateScore(hand);
      const bet = this.bets[index];
      const prefix = this.playerHands.length > 1 ? `Hero ${index + 1}: ` : '';
      let res = '';
      let narration = '';

      if (playerScore > 21) {
        res = 'Bust';
        narration = `${prefix || 'Hero'} busts because the score is ${playerScore}, which is greater than 21.`;
      } else if (dealerScore > 21) {
        this.balance += bet * 2;
        res = 'Win';
        narration = `You win because the dealer busts.`;
      } else if (playerScore > dealerScore) {
        this.balance += bet * 2;
        res = 'Win';
        narration = `You win because you have a score of ${playerScore} and the dealer has a score of ${dealerScore}.`;
      } else if (playerScore < dealerScore) {
        res = 'Lose';
        narration = `You lose because you have a score of ${playerScore} and the dealer has a score of ${dealerScore}.`;
      } else {
        this.balance += bet;
        res = 'Push';
        narration = `It's a push with a score of ${playerScore}.`;
      }
      results.push(prefix + res);
      narrations.push(narration);
    }

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

    // Narrate results
    for (const n of narrations) {
      await this.speak(n);
    }
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
    this.dom.dealerScore.innerText = `Score: ${this.gameState === 'playing' ? '?' : this.getScoreDisplay(this.dealerHand)}`;

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
      scoreDiv.innerText = `Score: ${this.getScoreDisplay(hand)}`;
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

    // Proceed Button
    if (this.waitingForSpace) {
      this.dom.proceedBtn.style.display = 'inline-block';
      this.dom.proceedBtn.classList.add('btn-recommended');
      // Hide other controls when proceeding
      this.dom.bettingControls.style.display = 'none';
      this.dom.actionControls.style.display = 'none';
    } else {
      this.dom.proceedBtn.style.display = 'none';
      this.dom.proceedBtn.classList.remove('btn-recommended');
    }
  }

  renderHand(container, hand, hideSecond = false) {
    container.innerHTML = '';
    const suitToColor = {
      '♠': 'black',
      '♥': 'red',
      '♣': 'green',
      '♦': 'blue'
    };

    hand.forEach((card, index) => {
      const cardEl = document.createElement('div');
      const cardColor = suitToColor[card.suit] || 'black';
      cardEl.className = `card ${cardColor}`;

      if (hideSecond && index === 1) {
        cardEl.classList.add('hidden');
        cardEl.innerHTML = `<div style="height:100%; display:flex; align-items:center; justify-content:center; color:rgba(255,255,255,0.2)">?</div>`;
      } else {
        cardEl.innerHTML = `<div style="height:100%; display:flex; align-items:center; justify-content:center;">${card.value}</div>`;
      }
      container.appendChild(cardEl);
    });
  }
}

// Start the game
window.onload = () => {
  new BlackjackGame();
};
