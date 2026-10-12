// dash-bot/commands/submitrecord.js
const { SlashCommandBuilder } = require('discord.js');
const { getDatabase } = require('firebase-admin/database');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('submitrecord')
    .setDescription('Envía un récord de nivel a revisión')
    .addStringOption(opt => opt.setName('nivel').setDescription('Nombre del nivel').setRequired(true))
    .addIntegerOption(opt => opt.setName('progreso').setDescription('Porcentaje (1-100)').setRequired(true))
    .addStringOption(opt => opt.setName('video').setDescription('Link del video de prueba').setRequired(true)),

  async execute(interaction) {
    const levelName = interaction.options.getString('nivel');
    const progress = interaction.options.getInteger('progreso');
    const video = interaction.options.getString('video');
    const db = getDatabase();

    await interaction.deferReply({ ephemeral: true });

    try {
      const recordsRef = db.ref('pending_records').push();
      await recordsRef.set({
        levelName: levelName || 'Nivel sin nombre',
        progress: Number(progress) || 0,
        videoUrl: video || '',
        userId: String(interaction.user.id),
        playerName: interaction.user.username || 'Usuario',
        userTag: interaction.user.tag || '',
        createdAt: Date.now(),
        notified: false
      });

      return interaction.editReply({
        content: `✅ **Récord enviado**: Tu récord de **${progress}%** en **${levelName}** fue enviado a revisión.`
      });
    } catch (error) {
      console.error('Error en submitrecord:', error);
      return interaction.editReply({ content: '❌ Error al enviar el récord.' });
    }
  }
};
