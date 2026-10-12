// dash-bot/commands/configtop.js
const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { getDatabase } = require('firebase-admin/database');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('configtop')
    .setDescription('Cambia la posición de Top de un nivel en la lista')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addStringOption(option =>
      option.setName('nivel')
        .setDescription('Nombre del nivel a mover')
        .setRequired(true)
    )
    .addIntegerOption(option =>
      option.setName('posicion')
        .setDescription('Nueva posición en el Top (Ej: 1, 2, 3...)')
        .setRequired(true)
        .setMinValue(1)
    ),

  async execute(interaction) {
    const levelName = interaction.options.getString('nivel').trim().toLowerCase();
    const newPosition = interaction.options.getInteger('posicion');
    const db = getDatabase();

    await interaction.deferReply({ ephemeral: true });

    try {
      const levelsSnap = await db.ref('levels').once('value');
      if (!levelsSnap.exists()) {
        return interaction.editReply({ content: '❌ No hay niveles registrados en la base de datos.' });
      }

      const levelsData = levelsSnap.val();
      const levelEntries = Object.entries(levelsData).map(([key, val]) => ({ key, ...val }));

      // Ordenar por su posición actual o fecha de creación
      levelEntries.sort((a, b) => (a.order || a.createdAt || 0) - (b.order || b.createdAt || 0));

      const targetIndex = levelEntries.findIndex(l => l.name && l.name.trim().toLowerCase() === levelName);
      if (targetIndex === -1) {
        return interaction.editReply({ content: `❌ No se encontró el nivel **"${interaction.options.getString('nivel')}"**.` });
      }

      if (newPosition > levelEntries.length) {
        return interaction.editReply({ content: `⚠️ La posición excede el total de niveles. Solo hay **${levelEntries.length}** niveles.` });
      }

      // Reorganizar array de niveles
      const [movedLevel] = levelEntries.splice(targetIndex, 1);
      levelEntries.splice(newPosition - 1, 0, movedLevel);

      // Guardar nuevo orden
      const updates = {};
      levelEntries.forEach((lvl, idx) => {
        updates[`levels/${lvl.key}/order`] = idx + 1;
      });

      await db.ref().update(updates);

      return interaction.editReply({
        content: `🏆 **Top Actualizado**: El nivel **${movedLevel.name}** ahora ocupa la posición **#${newPosition}** de **${levelEntries.length}**.`
      });
    } catch (err) {
      console.error('Error en configtop:', err);
      return interaction.editReply({ content: '❌ Ocurrió un error al reordenar los niveles.' });
    }
  }
};
