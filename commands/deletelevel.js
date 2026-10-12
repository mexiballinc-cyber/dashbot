// dash-bot/commands/deletelevel.js
const { SlashCommandBuilder } = require('discord.js');
const { getDatabase } = require('firebase-admin/database');

const ADMIN_IDS = ['1161557418073931807'];

module.exports = {
  data: new SlashCommandBuilder()
    .setName('deletelevel')
    .setDescription('Elimina un nivel de la DashList')
    .addStringOption(option =>
      option.setName('nivel')
        .setDescription('Nombre del nivel a eliminar')
        .setRequired(true)
    ),

  async execute(interaction) {
    if (!ADMIN_IDS.includes(interaction.user.id)) {
      return interaction.reply({ content: '❌ Sin permisos de administración.', flags: 64 });
    }

    await interaction.deferReply({ flags: 64 });

    const levelName = interaction.options.getString('nivel').trim().toLowerCase();
    const db = getDatabase();

    try {
      const levelsSnap = await db.ref('levels').once('value');
      if (!levelsSnap.exists()) {
        return interaction.editReply({ content: '❌ No hay niveles registrados.' });
      }

      const levels = levelsSnap.val();
      const levelKey = Object.keys(levels).find(
        k => levels[k].name && levels[k].name.trim().toLowerCase() === levelName
      );

      if (!levelKey) {
        return interaction.editReply({ content: `❌ No se encontró el nivel **"${interaction.options.getString('nivel')}"**.` });
      }

      const deletedName = levels[levelKey].name;
      await db.ref(`levels/${levelKey}`).remove();

      return interaction.editReply({
        content: `🗑️ **Nivel Eliminado**: El nivel **"${deletedName}"** ha sido borrado de la lista.`
      });
    } catch (err) {
      console.error('Error en deletelevel:', err);
      return interaction.editReply({ content: '❌ Error al eliminar el nivel de la base de datos.' });
    }
  }
};
