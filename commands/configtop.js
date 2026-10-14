// dash-bot/commands/configtop.js
const { SlashCommandBuilder } = require('discord.js');
const { getDatabase } = require('firebase-admin/database');

const ADMIN_IDS = ['1161557418073931807'];

module.exports = {
  data: new SlashCommandBuilder()
    .setName('configtop')
    .setDescription('Cambia la posición de Top de un nivel en la lista')
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
    await interaction.deferReply({ flags: 64 }).catch(() => {});

    if (!ADMIN_IDS.includes(interaction.user.id)) {
      return interaction.editReply({ content: '❌ Sin permisos de administración.' });
    }

    const levelName = interaction.options.getString('nivel').trim().toLowerCase();
    const newPosition = interaction.options.getInteger('posicion');
    const db = getDatabase();

    const fetchLevelsWithTimeout = new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('TIMEOUT_FIREBASE')), 4000);
      db.ref('levels').once('value')
        .then(snap => { clearTimeout(timer); resolve(snap); })
        .catch(err => { clearTimeout(timer); reject(err); });
    });

    try {
      const levelsSnap = await fetchLevelsWithTimeout;

      if (!levelsSnap.exists()) {
        return interaction.editReply({ content: '❌ No hay niveles registrados en la base de datos.' });
      }

      const levelsData = levelsSnap.val();
      const levelEntries = Object.entries(levelsData).map(([key, val]) => ({ key, ...val }));

      levelEntries.sort((a, b) => (a.order || a.createdAt || 0) - (b.order || b.createdAt || 0));

      const targetIndex = levelEntries.findIndex(l => l.name && l.name.trim().toLowerCase() === levelName);
      if (targetIndex === -1) {
        return interaction.editReply({ content: `❌ No se encontró el nivel **"${interaction.options.getString('nivel')}"**.` });
      }

      if (newPosition > levelEntries.length) {
        return interaction.editReply({ content: `⚠️ La posición excede el total de niveles. Solo hay **${levelEntries.length}** niveles.` });
      }

      const [movedLevel] = levelEntries.splice(targetIndex, 1);
      levelEntries.splice(newPosition - 1, 0, movedLevel);

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
      if (err.message === 'TIMEOUT_FIREBASE') {
        return interaction.editReply({ content: '⚠️ **Error de Conexión**: Firebase tardó demasiado en responder.' });
      }
      return interaction.editReply({ content: '❌ Ocurrió un error al reordenar los niveles.' });
    }
  }
};
