// dash-bot/index.js
require('dotenv').config();
const { 
  Client, 
  GatewayIntentBits, 
  Collection, 
  REST, 
  Routes, 
  EmbedBuilder, 
  ActionRowBuilder, 
  ButtonBuilder, 
  ButtonStyle 
} = require('discord.js');
const { initializeApp, cert, getApps } = require('firebase-admin/app');
const { getDatabase } = require('firebase-admin/database');
const fs = require('fs');
const path = require('path');

// Prefer TARGET_GUILD_ID from environment, fallback to hard-coded official guild
const TARGET_GUILD_ID = process.env.TARGET_GUILD_ID || '1555409817785344031';

let serviceAccount;
if (process.env.FIREBASE_SERVICE_ACCOUNT) {
  serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
} else {
  serviceAccount = require('./firebase-key.json');
}

if (getApps().length === 0) {
  initializeApp({
    credential: cert(serviceAccount),
    databaseURL: "https://dashlist-3fbec-default-rtdb.firebaseio.com"
  });
}

const db = getDatabase();

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ]
});

client.commands = new Collection();
const commandsPath = path.join(__dirname, 'commands');
let commandFiles = [];
try {
  commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith('.js'));
} catch (err) {
  console.error('No se pudo leer la carpeta de comandos:', err);
}
const commandsArray = [];

for (const file of commandFiles) {
  try {
    const command = require(path.join(commandsPath, file));
    if (!command || !command.data || !command.data.name) {
      console.warn(`El archivo ${file} no exporta command.data.name — será omitido.`);
      continue;
    }
    client.commands.set(command.data.name, command);
    commandsArray.push(command.data.toJSON());
  } catch (err) {
    console.error(`Error cargando comando ${file}:`, err);
  }
}

const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);

(async () => {
  try {
    console.log('Archivos de comando encontrados:', commandFiles);
    console.log('Comandos a registrar:', commandsArray.map(c => c.name));

    if (!process.env.CLIENT_ID || !process.env.DISCORD_TOKEN) {
      console.error('FALTAN CLIENT_ID o DISCORD_TOKEN en las variables de entorno. Abortando registro de comandos.');
      return;
    }

    // Solo limpiar globales si se activa explícitamente con la variable de entorno
    if (process.env.CLEAR_GLOBAL_COMMANDS === 'true') {
      console.log('⚠️ CLEAR_GLOBAL_COMMANDS=true -> limpiando comandos globales...');
      await rest.put(Routes.applicationCommands(process.env.CLIENT_ID), { body: [] });
    } else {
      console.log('No se limpiarán comandos globales (CLEAR_GLOBAL_COMMANDS no está en true).');
    }

    // Determinar dónde registrar los comandos: GUILD_IDS (lista), TARGET_GUILD_ID o global
    const envGuilds = (process.env.GUILD_IDS || '').split(',').map(s => s.trim()).filter(Boolean);
    const guildIds = envGuilds.length > 0 ? envGuilds : (TARGET_GUILD_ID ? [TARGET_GUILD_ID] : []);

    if (commandsArray.length === 0) {
      console.warn('No hay comandos para registrar (commandsArray vacío).');
    } else if (guildIds.length > 0) {
      console.log(`Cargando comandos Slash en ${guildIds.length} guild(s):`, guildIds);
      for (const gid of guildIds) {
        try {
          await rest.put(
            Routes.applicationGuildCommands(process.env.CLIENT_ID, gid),
            { body: commandsArray }
          );
          console.log(`Comandos registrados en el servidor ${gid} (instantáneo).`);
        } catch (err) {
          console.error(`Error registrando comandos en guild ${gid}:`, err);
        }
      }
    } else {
      // Sin guilds, registrar globalmente (puede tardar hasta 1 hora en propagarse)
      try {
        console.log('Registrando comandos GLOBALMENTE (puede tardar hasta 1 hora en aparecer)...');
        await rest.put(Routes.applicationCommands(process.env.CLIENT_ID), { body: commandsArray });
        console.log('Comandos globales registrados.');
      } catch (err) {
        console.error('Error registrando comandos globales:', err);
      }
    }

  } catch (error) {
    console.error('Error al registrar comandos Slash:', error);
  }
})();

// Función para calcular puntos de un nivel según su posición en el Top (#1 = 100pts)
function calculatePointsForRank(rank, totalLevels) {
  if (rank <= 0) return 0;
  const maxPoints = 100;
  const minPoints = 10;
  if (totalLevels <= 1) return maxPoints;
  const step = (maxPoints - minPoints) / (totalLevels - 1);
  return Math.round(maxPoints - step * (rank - 1));
}

function listenForPendingItems() {
  // 1. Escuchar Niveles Pendientes
  db.ref('pending_levels').on('child_added', async (snapshot) => {
    try {
      const data = snapshot.val();
      const key = snapshot.key;
      if (!data || data.notified) return;

      await db.ref(`pending_levels/${key}`).update({ notified: true });

      const channelSnap = await db.ref('settings/channels/levelsChannelId').once('value');
      const channelId = channelSnap.val();
      if (!channelId) return;

      const channel = await client.channels.fetch(channelId).catch(() => null);
      if (!channel) return;

      const embed = new EmbedBuilder()
        .setTitle(`📥 Nueva Solicitud de Nivel: ${data.name || 'Sin nombre'}`)
        .setColor(0x5865F2)
        .addFields(
          { name: 'Dificultad', value: String(data.difficulty || 'N/A'), inline: true },
          { name: 'ID del Nivel', value: String(data.gdId || 'N/A'), inline: true },
          { name: 'Creador (ID)', value: data.creatorId ? `<@${data.creatorId}> (\`${data.creatorId}\`)` : 'N/A', inline: true },
          { name: 'Verificador (ID)', value: data.verifierId ? `<@${data.verifierId}> (\`${data.verifierId}\`)` : 'N/A', inline: true },
          { name: '📺 Showcase', value: data.showcaseUrl ? `[Ver Showcase](${data.showcaseUrl})` : 'Sin video', inline: true },
          { name: '✅ Verificación', value: data.verificationUrl ? `[Ver Verificación](${data.verificationUrl})` : 'Sin video', inline: true },
          { name: '📁 Raw Footage', value: data.rawFootageUrl ? `[Ver Raw Footage](${data.rawFootageUrl})` : 'No proporcionado', inline: false }
        )
        .setFooter({ text: `Key: ${key}` });

      if (data.imgurUrl && typeof data.imgurUrl === 'string' && data.imgurUrl.startsWith('http')) {
        embed.setThumbnail(data.imgurUrl);
      }

      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`accept_level_${key}`).setLabel('Aceptar Nivel').setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId(`reject_level_${key}`).setLabel('Rechazar Nivel').setStyle(ButtonStyle.Danger)
      );

      await channel.send({ embeds: [embed], components: [row] });
    } catch (err) {
      console.error('Error procesando child_added en pending_levels:', err);
    }
  });

  // 2. Escuchar Récords Pendientes
  db.ref('pending_records').on('child_added', async (snapshot) => {
    try {
      const data = snapshot.val();
      const key = snapshot.key;
      if (!data || data.notified) return;

      await db.ref(`pending_records/${key}`).update({ notified: true });

      const channelSnap = await db.ref('settings/channels/recordsChannelId').once('value');
      const channelId = channelSnap.val() || (await db.ref('settings/channels/levelsChannelId').once('value')).val();
      if (!channelId) return;

      const channel = await client.channels.fetch(channelId).catch(() => null);
      if (!channel) return;

      const embed = new EmbedBuilder()
        .setTitle(`🏆 Nuevo Récord Enviado: ${data.levelName || 'Nivel Desconocido'}`)
        .setColor(0xFEE75C)
        .addFields(
          { name: 'Jugador', value: String(data.playerName || 'Anónimo'), inline: true },
          { name: 'Progreso', value: `${data.progress || 0}%`, inline: true },
          { name: 'País', value: String(data.country || 'N/A'), inline: true },
          { name: '🎥 Video Prueba', value: data.videoUrl ? `[Ver Video](${data.videoUrl})` : 'Sin enlace', inline: true },
          { name: '📁 Raw Footage', value: data.rawFootageUrl ? `[Ver Raw Footage](${data.rawFootageUrl})` : 'No proporcionado', inline: true }
        )
        .setFooter({ text: `Key: ${key}` });

      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`accept_record_${key}`).setLabel('Aceptar Récord').setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId(`reject_record_${key}`).setLabel('Rechazar Récord').setStyle(ButtonStyle.Danger)
      );

      await channel.send({ embeds: [embed], components: [row] });
    } catch (err) {
      console.error('Error procesando child_added en pending_records:', err);
    }
  });
}

client.on('interactionCreate', async (interaction) => {
  if (interaction.guildId !== TARGET_GUILD_ID) {
    if (interaction.isRepliable()) {
      return interaction.reply({ content: '❌ Este bot está configurado para operar únicamente en su servidor oficial.', ephemeral: true });
    }
    return;
  }

  if (interaction.isChatInputCommand()) {
    const command = client.commands.get(interaction.commandName);
    if (command) {
      try {
        await command.execute(interaction);
      } catch (err) {
        console.error(`Error ejecutando /${interaction.commandName}:`, err);
        const errMessage = { content: '❌ Ocurrió un error al ejecutar el comando.', ephemeral: true };
        if (interaction.deferred || interaction.replied) {
          await interaction.editReply(errMessage).catch(() => {});
        } else {
          await interaction.reply(errMessage).catch(() => {});
        }
      }
    }
    return;
  }

  if (interaction.isButton()) {
    const customId = interaction.customId;

    try {
      if (customId.startsWith('accept_level_')) {
        const key = customId.replace('accept_level_', '');
        await interaction.deferUpdate();

        const pendingSnap = await db.ref(`pending_levels/${key}`).once('value');
        if (!pendingSnap.exists()) {
          return interaction.followUp({ content: '⚠️ Este nivel ya fue procesado.', ephemeral: true });
        }

        const levelData = pendingSnap.val();
        
        const currentLevelsSnap = await db.ref('levels').once('value');
        const totalCurrent = currentLevelsSnap.exists() ? Object.keys(currentLevelsSnap.val()).length : 0;

        await db.ref('levels').push().set({ 
          ...levelData, 
          order: totalCurrent + 1,
          createdAt: Date.now() 
        });

        if (levelData.creatorId) {
          const creatorRef = db.ref(`leaderboard/${levelData.creatorId}`);
          const creatorSnap = await creatorRef.once('value');
          const currentCreated = creatorSnap.exists() ? (creatorSnap.val().createdCount || 0) : 0;
          await creatorRef.update({
            name: levelData.creatorName || `User_${levelData.creatorId}`,
            createdCount: currentCreated + 1
          });
        }

        if (levelData.verifierId) {
          const verifierRef = db.ref(`leaderboard/${levelData.verifierId}`);
          const verifierSnap = await verifierRef.once('value');
          const currentVerified = verifierSnap.exists() ? (verifierSnap.val().verifiedCount || 0) : 0;
          await verifierRef.update({
            name: levelData.verifierName || `User_${levelData.verifierId}`,
            verifiedCount: currentVerified + 1
          });
        }

        await db.ref(`pending_levels/${key}`).remove();

        const embed = EmbedBuilder.from(interaction.message.embeds[0])
          .setColor(0x57F287)
          .setTitle(`✅ Nivel Publicado (Posición Top #${totalCurrent + 1})`);
        await interaction.editReply({ embeds: [embed], components: [] });
      }

      if (customId.startsWith('accept_record_')) {
        const key = customId.replace('accept_record_', '');
        await interaction.deferUpdate();

        const pendingSnap = await db.ref(`pending_records/${key}`).once('value');
        if (!pendingSnap.exists()) {
          return interaction.followUp({ content: '⚠️ Este récord ya fue procesado.', ephemeral: true });
        }

        const recData = pendingSnap.val();
        const playerId = recData.userId || (recData.playerName ? recData.playerName.toLowerCase().replace(/\s+/g, '_') : 'unknown_user');

        const levelsSnap = await db.ref('levels').once('value');
        let levelRank = 1;
        let totalLevels = 1;
        let levelKeyFound = null;

        if (levelsSnap.exists()) {
          const levelsData = levelsSnap.val();
          const levelEntries = Object.entries(levelsData).map(([k, v]) => ({ key: k, ...v }));
          levelEntries.sort((a, b) => (a.order || a.createdAt || 0) - (b.order || b.createdAt || 0));
          totalLevels = levelEntries.length;

          const targetIndex = levelEntries.findIndex(
            l => l.name && l.name.trim().toLowerCase() === (recData.levelName || '').trim().toLowerCase()
          );

          if (targetIndex !== -1) {
            levelRank = targetIndex + 1;
            levelKeyFound = levelEntries[targetIndex].key;
          }
        }

        const maxLevelPoints = calculatePointsForRank(levelRank, totalLevels);
        const pointsToAdd = recData.progress === 100 
          ? maxLevelPoints 
          : Math.floor(maxLevelPoints * ((recData.progress || 0) / 100));

        const playerRef = db.ref(`leaderboard/${playerId}`);
        const playerSnap = await playerRef.once('value');
        const currentPoints = playerSnap.exists() ? (playerSnap.val().points || 0) : 0;

        await playerRef.update({
          name: recData.playerName || 'Anónimo',
          points: currentPoints + pointsToAdd,
          country: recData.country || 'N/A'
        });

        if (levelKeyFound) {
          await db.ref(`levels/${levelKeyFound}/records`).push().set({
            playerName: recData.playerName || 'Anónimo',
            progress: recData.progress || 100,
            videoUrl: recData.videoUrl || recData.video || '',
            rawFootageUrl: recData.rawFootageUrl || '',
            userId: recData.userId || '',
            approvedAt: Date.now()
          });
        }

        await db.ref(`pending_records/${key}`).remove();

        const embed = EmbedBuilder.from(interaction.message.embeds[0])
          .setColor(0x57F287)
          .setTitle(`✅ Récord Aceptado: +${pointsToAdd} Pts a ${recData.playerName || 'Jugador'} (Nivel Top #${levelRank})`);
        await interaction.editReply({ embeds: [embed], components: [] });
      }

      if (customId.startsWith('reject_level_')) {
        const key = customId.replace('reject_level_', '');
        await interaction.deferUpdate();
        await db.ref(`pending_levels/${key}`).remove();
        await interaction.editReply({ content: '❌ Solicitud de nivel rechazada y eliminada.', embeds: [], components: [] });
      }

      if (customId.startsWith('reject_record_')) {
        const key = customId.replace('reject_record_', '');
        await interaction.deferUpdate();
        await db.ref(`pending_records/${key}`).remove();
        await interaction.editReply({ content: '❌ Solicitud de récord rechazada y eliminada.', embeds: [], components: [] });
      }
    } catch (btnErr) {
      console.error('Error al procesar interacción de botón:', btnErr);
    }
  }
});

client.once('ready', () => {
  console.log(`🤖 DASH Bot encendido y protegido para el servidor ${TARGET_GUILD_ID}`);
  listenForPendingItems();
});

const http = require('http');
http.createServer((req, res) => res.end('DASH Bot Online 24/7')).listen(process.env.PORT || 3000);

client.login(process.env.DISCORD_TOKEN);
