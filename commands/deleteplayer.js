// dash-bot/commands/deleteplayer.js
const { SlashCommandBuilder } = require('discord.js');
const { getDatabase } = require('firebase-admin/database');

const ADMIN_IDS = ['1161557418073931807'];

module.exports = {
  data: new SlashCommandBuilder()
    .setName('deleteplayer')
    .setDescription('Elimina un jugador de la Leaderboard')
    .addStringOption(option =>
      option.setName('jugador')
        .setDescription('ID de Discord o nombre del jugador')
        .setRequired(true)
    ),

  async execute(interaction) {
    if (!ADMIN_IDS.includes(interaction.user.id)) {
      return interaction.reply({ content: '❌ Sin permisos de administración.', flags: 64 });
    }

    await interaction.deferReply({ flags: 64 });

    const query = interaction.options.getString('jugador').trim().toLowerCase();
    const db = getDatabase();

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
