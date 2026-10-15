// dash-bot/index.js
const fs = require('fs');
const path = require('path');

// 1. CARGA DE VARIABLES DE ENTORNO (SECRET FILES DE RENDER O LOCAL)
const RENDER_ENV_PATH = '/etc/secrets/.env';
if (fs.existsSync(RENDER_ENV_PATH)) {
  require('dotenv').config({ path: RENDER_ENV_PATH });
  console.log('✅ Cargadas variables de entorno desde Secret File (/etc/secrets/.env)');
} else {
  require('dotenv').config();
}

console.log('🔍 Estado de credenciales:');
console.log('   - CLIENT_ID:', process.env.CLIENT_ID ? '✅ OK' : '❌ FALTANTE');
console.log('   - DISCORD_TOKEN:', process.env.DISCORD_TOKEN ? '✅ OK' : '❌ FALTANTE');
console.log('   - TARGET_GUILD_ID:', process.env.TARGET_GUILD_ID ? '✅ OK' : '❌ FALTANTE');

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

const TARGET_GUILD_ID = process.env.TARGET_GUILD_ID || '1555409817785344031';

// 2. CARGA DE CREDENCIALES DE FIREBASE (SECRET FILES DE RENDER O LOCAL)
let serviceAccount = null;
const RENDER_SECRET_PATH = '/etc/secrets/firebase-key.json';
const LOCAL_SECRET_PATH = path.join(__dirname, 'firebase-key.json');

if (fs.existsSync(RENDER_SECRET_PATH)) {
  try {
    serviceAccount = JSON.parse(fs.readFileSync(RENDER_SECRET_PATH, 'utf8'));
    console.log('✅ Cargadas credenciales de Firebase desde Secret File (/etc/secrets/firebase-key.json)');
  } catch (err) {
    console.error('❌ Error leyendo Secret File de Firebase:', err.message);
  }
} else if (fs.existsSync(LOCAL_SECRET_PATH)) {
  try {
    serviceAccount = require(LOCAL_SECRET_PATH);
    console.log('✅ Cargadas credenciales de Firebase desde archivo local');
  } catch (err) {
    console.error('❌ Error leyendo firebase-key.json local:', err.message);
  }
} else if (process.env.FIREBASE_SERVICE_ACCOUNT) {
  try {
    serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
    console.log('✅ Cargadas credenciales desde variable FIREBASE_SERVICE_ACCOUNT');
  } catch (err) {
    console.error('❌ Error parseando FIREBASE_SERVICE_ACCOUNT:', err.message);
  }
}

if (!serviceAccount) {
  console.error('⚠️ CRÍTICO: No se encontraron credenciales válidas de Firebase.');
} else if (getApps().length === 0) {
  initializeApp({
    credential: cert(serviceAccount),
    databaseURL: "https://dashlist-3fbec-default-rtdb.firebaseio.com"
  });
  console.log('🔥 Firebase Admin SDK Inicializado con éxito.');
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

// CARGA DINÁMICA DE COMANDOS DE LA CARPETA /commands
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
    if (!command || !command.data || !command.data.name) continue;
    client.commands.set(command.data.name, command);
    commandsArray.push(command.data.toJSON());
  } catch (err) {
    console.error(`Error cargando comando ${file}:`, err);
  }
}

function calculatePointsForRank(rank, totalLevels) {
  if (rank <= 0) return 0;
  const maxPoints = 100;
  const minPoints = 10;
  if (totalLevels <= 1) return maxPoints;
  const step = (maxPoints - minPoints) / (totalLevels - 1);
  return Math.round(maxPoints - step * (rank - 1));
}

// Helper para encontrar o crear usuario único en la Leaderboard sin duplicar
async function getOrCreatePlayerKey(rawIdOrName, defaultName) {
  if (!rawIdOrName) return null;
  const lbSnap = await db.ref('leaderboard').once('value');
  const searchStr = String(rawIdOrName).trim().toLowerCase();

  if (lbSnap.exists()) {
    const players = lbSnap.val();
    const existingKey = Object.keys(players).find(k => 
      k.toLowerCase() === searchStr || 
      (players[k].discordId && players[k].discordId.toLowerCase() === searchStr) ||
      (players[k].name && players[k].name.trim().toLowerCase() === searchStr)
    );
    if (existingKey) return existingKey;
  }

  return String(rawIdOrName).trim();
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
          { name: 'Creador (ID)', value: data.creatorId ? `<@${data.creatorId}> (\`${data.creatorId}\`)` : (data.creatorName || 'N/A'), inline: true },
          { name: 'Verificador (ID)', value: data.verifierId ? `<@${data.verifierId}> (\`${data.verifierId}\`)` : (data.verifierName || 'N/A'), inline: true },
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

// CONTROL DE INTERACCIONES Y COMANDOS SLASH
client.on('interactionCreate', async (interaction) => {
  if (interaction.guildId !== TARGET_GUILD_ID) {
    if (interaction.isRepliable()) {
      return interaction.reply({ content: '❌ Este bot está configurado para operar únicamente en su servidor oficial.', flags: 64 });
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
        const errMessage = { content: '❌ Ocurrió un error al ejecutar el comando.', flags: 64 };
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
          return interaction.followUp({ content: '⚠️ Este nivel ya fue procesado.', flags: 64 });
        }

        const levelData = pendingSnap.val();
        const currentLevelsSnap = await db.ref('levels').once('value');
        const totalCurrent = currentLevelsSnap.exists() ? Object.keys(currentLevelsSnap.val()).length : 0;

        await db.ref('levels').push().set({ 
          ...levelData, 
          order: totalCurrent + 1,
          createdAt: Date.now() 
        });

        const rawCreator = levelData.creatorId || levelData.creatorName;
        if (rawCreator) {
          const creatorKey = await getOrCreatePlayerKey(rawCreator, levelData.creatorName);
          const creatorRef = db.ref(`leaderboard/${creatorKey}`);
          const creatorSnap = await creatorRef.once('value');
          const currentCreated = creatorSnap.exists() ? (creatorSnap.val().createdCount || 0) : 0;
          await creatorRef.update({
            name: levelData.creatorName || creatorSnap.val()?.name || `User_${rawCreator}`,
            createdCount: currentCreated + 1
          });
        }

        const rawVerifier = levelData.verifierId || levelData.verifierName;
        if (rawVerifier) {
          const verifierKey = await getOrCreatePlayerKey(rawVerifier, levelData.verifierName);
          const verifierRef = db.ref(`leaderboard/${verifierKey}`);
          const verifierSnap = await verifierRef.once('value');
          const currentVerified = verifierSnap.exists() ? (verifierSnap.val().verifiedCount || 0) : 0;
          await verifierRef.update({
            name: levelData.verifierName || verifierSnap.val()?.name || `User_${rawVerifier}`,
            verifiedCount: currentVerified + 1
          });
        }

        await db.ref(`pending_levels/${key}`).remove();

        const embed = EmbedBuilder.from(interaction.message.embeds[0])
          .setColor(0x57F287)
          .setTitle(`✅ Nivel Publicado (Posición Top #${totalCurrent + 1})`);

        await interaction.message.edit({ embeds: [embed], components: [] }).catch(async (err) => {
          console.error('Error editando mensaje tras accept_level:', err);
          try { await interaction.followUp({ content: '✅ Nivel publicado (no se pudo actualizar el mensaje original).', flags: 64 }); } catch (e) {}
        });
      }

      if (customId.startsWith('accept_record_')) {
        const key = customId.replace('accept_record_', '');
        await interaction.deferUpdate();

        const pendingSnap = await db.ref(`pending_records/${key}`).once('value');
        if (!pendingSnap.exists()) {
          return interaction.followUp({ content: '⚠️ Este récord ya fue procesado.', flags: 64 });
        }

        const recData = pendingSnap.val();
        const rawPlayer = recData.userId || recData.playerName;
        const playerKey = await getOrCreatePlayerKey(rawPlayer, recData.playerName);

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

        const playerRef = db.ref(`leaderboard/${playerKey}`);
        const playerSnap = await playerRef.once('value');
        const currentPoints = playerSnap.exists() ? (playerSnap.val().points || 0) : 0;

        await playerRef.update({
          name: recData.playerName || playerSnap.val()?.name || 'Anónimo',
          points: currentPoints + pointsToAdd,
          country: recData.country || playerSnap.val()?.country || 'N/A'
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

        await interaction.message.edit({ embeds: [embed], components: [] }).catch(async (err) => {
          console.error('Error editando mensaje tras accept_record:', err);
          try { await interaction.followUp({ content: `✅ Récord aceptado (no se pudo actualizar el mensaje original).`, flags: 64 }); } catch (e) {}
        });
      }

      if (customId.startsWith('reject_level_')) {
        const key = customId.replace('reject_level_', '');
        await interaction.deferUpdate();
        await db.ref(`pending_levels/${key}`).remove();
        await interaction.message.edit({ content: '❌ Solicitud de nivel rechazada y eliminada.', embeds: [], components: [] }).catch(async (err) => {
          console.error('Error editando mensaje tras reject_level:', err);
          try { await interaction.followUp({ content: '❌ Solicitud de nivel rechazada y eliminada.', flags: 64 }); } catch (e) {}
        });
      }

      if (customId.startsWith('reject_record_')) {
        const key = customId.replace('reject_record_', '');
        await interaction.deferUpdate();
        await db.ref(`pending_records/${key}`).remove();
        await interaction.message.edit({ content: '❌ Solicitud de récord rechazada y eliminada.', embeds: [], components: [] }).catch(async (err) => {
          console.error('Error editando mensaje tras reject_record:', err);
          try { await interaction.followUp({ content: '❌ Solicitud de récord rechazada y eliminada.', flags: 64 }); } catch (e) {}
        });
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

// Servidor Web para mantener Render activo 24/7
const http = require('http');
http.createServer((req, res) => res.end('DASH Bot Online 24/7')).listen(process.env.PORT || 3000);

// 3. INICIO DE SESIÓN DIRECTO Y REGISTRO ASÍNCRONO DE COMANDOS
const token = process.env.DISCORD_TOKEN;
const clientId = process.env.CLIENT_ID;

if (!token || !clientId) {
  console.error('❌ FATAL: No se proporcionó DISCORD_TOKEN o CLIENT_ID.');
} else {
  console.log('🔑 Intentando conectar con Discord API...');
  client.login(token).catch((err) => {
    console.error('❌ Error fatal al conectar con Discord API:', err.message);
  });

  // Registro de comandos en segundo plano para no congelar la conexión del WebSocket
  const rest = new REST({ version: '10' }).setToken(token);
  (async () => {
    try {
      if (process.env.CLEAR_GLOBAL_COMMANDS === 'true') {
        await rest.put(Routes.applicationCommands(clientId), { body: [] });
      }

      const envGuilds = (process.env.GUILD_IDS || '').split(',').map(s => s.trim()).filter(Boolean);
      const guildIds = envGuilds.length > 0 ? envGuilds : (TARGET_GUILD_ID ? [TARGET_GUILD_ID] : []);

      if (guildIds.length > 0) {
        for (const gid of guildIds) {
          await rest.put(Routes.applicationGuildCommands(clientId, gid), { body: commandsArray });
        }
        console.log(`✅ Comandos Slash registrados con éxito en servidor (${guildIds.join(', ')})`);
      }
    } catch (error) {
      console.error('⚠️ Error al registrar comandos Slash:', error.message);
    }
  })();
}
