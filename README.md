# Goal for Mean Queen
- In the mean-queen folder, create a game in index.html called Mean Queen
- It is like Black Jack but don't bother with card counting, because we will just use 1 deck and reset after every round
  - The deck will just have A, 2, 3, 4, 5, where A will have a value of 1 only (not 11).
- Don't use dollars, just keep track of how many rounds each player has won
- Just have "Hit" and "Stand" without "Split" and "Double Down"
- Instead of 21, have the limit be 10.

# Goal for Black Jack Game
- I want to simulate card counting of heads-up black jack game in the casinos

# m1f
- Let's add a query param pause_dealer=1 to pause the dealer's action and let the user to press space to continue

# m1e
- Let's remove the suits when displaying the cards
  - Use color instead (red, black, green and blue)

# m1d
- Instead of pausing a fixed amount of time, let's redesign the whole flow to narrate (using speech synthesis with a British guy) to clarify things
  - When moving from the "Deal" action, utter "You are dealt a $x and a $y." 
  - When moving from the "Hit" action, utter "You are dealt a $x." 
  - When moving from the "Stand" action, utter "You stand with a score of $x." 
  - When moving from the "Double" action, utter "You double down with a score of $x." 
  - When moving from the "Split" action, utter "You split with a score of $x for hand 1 and $y for hand 2." 
  - When the dealer reveals a card, utter "The dealer reveals a $x." 
  - When the dealer hits, utter "The dealer hits and is dealt a $x." 
  - When the dealer stands, utter "The dealer stands with a score of $x." 
  - When the player wins, utter "You win because you have a score of $x and the dealer has a score of $y." 
    - Or "becuase the dealer busts." 
  - When the player loses, utter "You lose because you have a score of $x and the dealer has a score of $y." 
    - Or "becuase you bust."

# m1c
- Display 10 instead of J, Q, K for easier understanding
- Display 1 instead of A for easier understanding

# m1b
- Display all possible score if there are > 0 aces

# m1a
- Create index.html
- Make a black jack game with 1 dealer and 1 player
- Use 2 decks of cards and only reset back to 2 decks when the shoe is 75% used
- Start with $200 for the player
- Implement all the standard black jack rules and provide buttons or inputs for bet amount, hit, stand, double down, and split when applicable
- Use Hi-Lo card counting strategy to display the running count and true count and the recommended bet size.