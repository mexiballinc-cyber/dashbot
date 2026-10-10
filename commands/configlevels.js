// dash-bot/commands/configlevels.js
const { SlashCommandBuilder, PermissionFlagsBits, ChannelType } = require('discord.js');
const admin = require('firebase-admin');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('configlevels')
    .setDescription('Configura el canal donde llegarán las solicitudes de nuevos niveles')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addChannelOption(option =>
      option.setName('canal')
        .setDescription('El canal de texto para revisar niveles')
        .addChannelTypes(ChannelType.GuildText)
        .setRequired(true)
    ),

  async execute(interaction) {
    const channel = interaction.options.getChannel('canal');
    const db = admin.database();

    try {
      await interaction.deferReply({ ephemeral: true });

      // Guardar el ID del canal en la configuración de Firebase Realtime Database
      await db.ref('settings/channels').update({
        levelsChannelId: channel.id,
        updatedBy: interaction.user.tag,
        updatedAt: Date.now()
      });

      return interaction.editReply({
        content: `✅ **Canal Configurado**: Las solicitudes de niveles ahora se enviarán a ${channel}.`
      });
    } catch (error) {
      console.error(error);
      return interaction.editReply({ content: '❌ Ocurrió un error al guardar el canal en la base de datos.' });
    }
  }
};
