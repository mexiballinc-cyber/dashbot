// dash-bot/commands/deleteplayer.js
const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { getDatabase } = require('firebase-admin/database');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('deleteplayer')
    .setDescription('Elimina un jugador de la Leaderboard')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addStringOption(option =>
      option.setName('jugador')
        .setDescription('ID de Discord o nombre del jugador')
        .setRequired(true)
    ),

  async execute(interaction) {
    const query = interaction.options.getString('jugador').trim().toLowerCase();
    const db = getDatabase();

    await interaction.deferReply({ ephemeral: true });

    try {
      const lbSnap = await db.ref('leaderboard').once('value');
      if (!lbSnap.exists()) {
        return interaction.editReply({ content: '❌ La leaderboard está vacía.' });
      }

      const players = lbSnap.val();
      const playerKey = Object.keys(players).find(k => 
        k.toLowerCase() === query || 
        (players[k].name && players[k].name.trim().toLowerCase() === query) ||
        (players[k].discordId && players[k].discordId === query)
      );

      if (!playerKey) {
        return interaction.editReply({ content: `❌ No se encontró al jugador **"${interaction.options.getString('jugador')}"**.` });
      }

      const playerName = players[playerKey].name || playerKey;
      await db.ref(`leaderboard/${playerKey}`).remove();

      return interaction.editReply({
        content: `🗑️ **Jugador Eliminado**: **"${playerName}"** fue eliminado de la Leaderboard.`
      });
    } catch (err) {
      console.error('Error en deleteplayer:', err);
      return interaction.editReply({ content: '❌ Ocurrió un error al eliminar al jugador.' });
    }
  }
};
