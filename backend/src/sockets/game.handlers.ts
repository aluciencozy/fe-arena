import { Server, Socket } from "socket.io";
import { getUserSession, getPlayersInRoom } from "../services/room.service.js";
import type { GameState } from "../types/index.js";
import {
  createGame,
  getGameState,
  startRoundTimer,
  PLAYLIST,
} from "../services/game.service.js";

export const registerGameHandler = (io: Server, socket: Socket) => {
  socket.on("chat:message", (message: string) => {
    const session = getUserSession(socket.id); // Get user's session to find out which room they are in and their username

    if (!session) return; // If there's no session for the socket, do nothing

    const { roomId, username } = session;

    // Get the current game state, players in the room, opponent's username, and current video information to check if the message is a correct guess
    const gameState = getGameState(roomId);
    const playersInRoom = getPlayersInRoom(roomId);
    const opponent = playersInRoom.find((player) => player !== username);
    const currentVideo = PLAYLIST.find(
      (video) => video.videoId === gameState?.currentVideoID,
    );

    // Only check for correct guesses if the game is in a state where guessing is allowed, the opponent exists and has health, and the player hasn't already guessed correctly this round
    if (
      gameState &&
      opponent &&
      (gameState.phase === "PLAYING" || gameState.phase === "GRACE_PERIOD") &&
      !gameState.guessedCorrectly.includes(username)
    ) {
      // Check if the message is incorrect (case-insensitive, ignoring leading/trailing whitespace)
      if (message.trim().toLowerCase() !== currentVideo?.answer?.toLowerCase()) {
        // If the message is not the correct guess, send the chat message as a normal user message
        io.to(roomId).emit("chat:broadcast", { username, message });
        return;
      }

      // Check if there is a roundStartTime, if not just broadcast the message like normal
      if (gameState.roundStartTime === null) {
        io.to(roomId).emit("chat:broadcast", { username, message });
        return;
      }

      // Calculate damage based on how long the round has been going on, with a minimum of 100 damage and a maximum of 1000 damage, and store it in the pendingDamage object for the player who guessed correctly
      const elapsedSeconds = Math.floor((Date.now() - gameState.roundStartTime!) / 1000);
      const damage = Math.max(100, Math.min(1000, 1000 - elapsedSeconds));
      gameState.pendingDamage[username] = damage;
      gameState.guessedCorrectly.push(username);

      // Clear the round timer when a correct guess is made to prevent it from ending the round while we're in the grace period
      if (gameState.roundTimer) clearTimeout(gameState.roundTimer);

      // If the game is currently in the PLAYING phase, transition to GRACE_PERIOD to give players a moment to see the correct guess and damage dealt before moving to the next round or ending the game
      if (gameState.phase === "PLAYING") {
        gameState.phase = "GRACE_PERIOD"; // Transition to a 3 second grace period after a correct guess
        setTimeout(() => {
          // Calculate the difference in damage between the two players
          const damageDifference =
            (gameState.pendingDamage[username] || 0) -
            (gameState.pendingDamage[opponent] || 0);

          const myHealth = gameState.health[username];
          const opponentHealth = gameState.health[opponent];

          // If the player guessed first
          if (damageDifference > 0 && typeof opponentHealth === "number") {
            gameState.health[opponent] = Math.max(0, opponentHealth - damageDifference);
            io.to(roomId).emit("chat:broadcast", {
              username: "SYSTEM",
              message: `${username} dealt ${damageDifference} damage to ${opponent}!`,
              type: "SYSTEM",
            });
          }
          // If the opponent guessed first
          else if (damageDifference < 0 && typeof myHealth === "number") {
            gameState.health[username] = Math.max(0, myHealth + damageDifference);
            io.to(roomId).emit("chat:broadcast", {
              username: "SYSTEM",
              message: `${opponent} dealt ${Math.abs(damageDifference)} damage to ${username}!`,
              type: "SYSTEM",
            });
          }
          // If both players guessed at the same time, it's a tie and no damage is dealt
          else {
            io.to(roomId).emit("chat:broadcast", {
              username: "SYSTEM",
              message: `It was a tie! No damage dealt!`,
              type: "SYSTEM",
            });
          }

          if (gameState.health[opponent] === 0) {
            gameState.phase = "GAME_OVER"; // End the game if opponent's health reaches 0
          } else {
            gameState.phase = "ROUND_END"; // Otherwise, end the round and prepare for the next one
          }

          io.to(roomId).emit("game:state", gameState); // Emit the updated game state after the grace period ends

          setTimeout(() => {
            // If the game is not over, set up next round values
            if (gameState.phase === "GAME_OVER") return;

            gameState.currentRound += 1;
            gameState.roundStartTime = Date.now();
            gameState.guessedCorrectly = [];
            gameState.pendingDamage = {};
            gameState.phase = "PLAYING";
            gameState.currentVideoID =
              PLAYLIST[gameState.currentRound % PLAYLIST.length]!.videoId;

            io.to(roomId).emit("game:state", gameState);

            startRoundTimer(roomId, io); // Start the round timer for the new round
          }, 2000); // Short delay before starting the next round or ending the game to allow clients to update their UI
        }, 3000);
      }

      // Emit the updated game state and a system message announcing the correct guess and damage dealt to the opponent
      io.to(roomId).emit("game:state", gameState);
      io.to(roomId).emit("chat:broadcast", {
        username: "SYSTEM",
        message: `${username} guessed correctly`,
        type: "SYSTEM",
      });

      return;
    }

    // If the game is not active or there's no opponent, just broadcast the chat message without checking for guesses
    io.to(roomId).emit("chat:broadcast", { username, message });
  });

  socket.on("game:start", () => {
    const session = getUserSession(socket.id);

    if (!session) return; // If there's no session for the socket, do nothing

    const { roomId } = session;

    const players = getPlayersInRoom(roomId);

    if (players.length < 2) {
      socket.emit("game:error", "At least 2 players are required to start the game.");
      return;
    }

    const healthValues: Record<string, number> = {};
    players.forEach((player) => {
      healthValues[player] = 5000; // Start with 5000 health for each player
    });

    // Initialize the game state
    const gameState: GameState = {
      phase: "PLAYING",
      currentRound: 0,
      health: healthValues, // Start with 5000 health for each player
      pendingDamage: {}, // Initialize pending damage as an empty object
      currentVideoID: "B5UUcVGqBDE",
      videoStartTime: 0,
      roundStartTime: Date.now(),
      guessedCorrectly: [],
    };

    createGame(roomId, gameState);

    startRoundTimer(roomId, io); // Start the round timer when the game starts

    io.to(roomId).emit("game:state", gameState);
  });
};
