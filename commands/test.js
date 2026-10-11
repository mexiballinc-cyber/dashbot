// dash-bot/commands/test.js
const { SlashCommandBuilder } = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('test')
    .setDescription('Prueba si el bot responde'),

  async execute(interaction) {
    try {
      await interaction.reply({ 
        content: '✅ como tamo mi gente, aqui eta vaina ta funcionando' 
      });
    } catch (error) {
      console.error('Error en test:', error);
      // En caso de error al responder (si el try truena)
      await interaction.reply({ 
        content: '❌ mira bien hijo de pu%& madre o sirves o te pego', 
        ephemeral: true 
      }).catch(() => {});
    }
  }
};
