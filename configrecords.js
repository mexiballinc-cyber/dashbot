// dash-bot/commands/configrecords.js
const { SlashCommandBuilder, PermissionFlagsBits, ChannelType } = require('discord.js');
const admin = require('firebase-admin');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('configrecords')
    .setDescription('Configura el canal donde llegarán los récords enviados desde la web o el servidor')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addChannelOption(option =>
      option.setName('canal')
        .setDescription('El canal de texto para revisar récords')
        .addChannelTypes(ChannelType.GuildText)
        .setRequired(true)
    ),

  async execute(interaction) {
    const channel = interaction.options.getChannel('canal');
    const db = admin.database();

    try {
      await interaction.deferReply({ ephemeral: true });

      await db.ref('settings/channels').update({
        recordsChannelId: channel.id,
        updatedBy: interaction.user.tag,
        updatedAt: Date.now()
      });

      return interaction.editReply({
        content: `✅ **Canal de Récords Configurado**: Las solicitudes de récords ahora se enviarán a ${channel}.`
      });
    } catch (error) {
      console.error(error);
      return interaction.editReply({ content: '❌ Ocurrió un error al guardar el canal en la base de datos.' });
    }
  }
};