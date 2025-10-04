package com.example.washsimple.service;

import com.example.washsimple.model.Machine;
import com.example.washsimple.model.QueueEntry;
import com.example.washsimple.repo.MachineRepository;
import com.example.washsimple.repo.QueueEntryRepository;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.stereotype.Service;
import jakarta.annotation.PostConstruct;

import java.time.Instant;
import java.util.*;
import java.util.concurrent.*;

@Service
public class MachineService {
    private final MachineRepository machineRepo;
    private final QueueEntryRepository queueRepo;
    private final SimpMessagingTemplate messaging;
    private final ScheduledExecutorService scheduler = Executors.newScheduledThreadPool(4);
    private final Map<Long, ScheduledFuture<?>> tasks = new ConcurrentHashMap<>();
    private final Set<Long> notifiedQueueEntries = Collections.newSetFromMap(new ConcurrentHashMap<>());

    public MachineService(MachineRepository machineRepo, QueueEntryRepository queueRepo, SimpMessagingTemplate messaging){
        this.machineRepo = machineRepo;
        this.queueRepo = queueRepo;
        this.messaging = messaging;
    }

    @PostConstruct
    public void init(){
        // Clear all existing data on startup
        queueRepo.deleteAll();
        machineRepo.deleteAll();

        // Initialize 5 clean machines
        for(int i=1;i<=5;i++){
            Machine m = new Machine();
            m.setName("Machine "+i);
            m.setInUse(false);
            machineRepo.save(m);
        }

        // broadcast current state every second
        scheduler.scheduleAtFixedRate(this::broadcast,0,1,TimeUnit.SECONDS);

        // notifier checks each 30 seconds
        scheduler.scheduleAtFixedRate(this::scheduleNotifier,5,30,TimeUnit.SECONDS);
    }

    public List<Machine> list(){ return machineRepo.findAll(); }

    public synchronized Map<String,Object> joinQueue(Long machineId, Long userId, int minutes){
        Optional<Machine> om = machineRepo.findById(machineId);
        if (!om.isPresent()) return Map.of("error","notfound");
        Machine m = om.get();

        boolean alreadyQueuedOrUsing = queueRepo.findAll().stream()
                .anyMatch(q -> q.getUserId().equals(userId))
                || machineRepo.findAll().stream()
                .anyMatch(mm -> userId.equals(mm.getCurrentUserId()));
        if(alreadyQueuedOrUsing) return Map.of("error","You can only join one machine at a time!");

        QueueEntry qe = new QueueEntry();
        qe.setMachineId(machineId);
        qe.setUserId(userId);
        qe.setMinutes(minutes);
        qe.setCreatedAt(Instant.now());
        queueRepo.save(qe);

        int pos = queueRepo.findByMachineIdOrderByCreatedAt(machineId).size();
        broadcast();
        return Map.of("queued", true, "position", pos);
    }

    public synchronized Map<String,Object> startWashing(Long machineId, Long userId, int minutes){
        Optional<Machine> om = machineRepo.findById(machineId);
        if(om.isEmpty()) return Map.of("error","notfound");
        Machine m = om.get();

        if(machineRepo.findAll().stream().anyMatch(mm -> userId.equals(mm.getCurrentUserId()))) {
            return Map.of("error", "You can only start one machine at a time!");
        }

        queueRepo.findByMachineIdOrderByCreatedAt(machineId).stream()
                .filter(e -> e.getUserId().equals(userId))
                .findFirst().ifPresent(queueRepo::delete);

        if(m.isInUse()){
            return Map.of("error","in_use");
        }

        m.setInUse(true);
        m.setCurrentUserId(userId);
        Instant end = Instant.now().plusSeconds(minutes*60L);
        m.setEndTime(end);
        machineRepo.save(m);
        scheduleEnd(m);
        broadcast();
        return Map.of("started", true, "endTime", end.toString());
    }

    private void scheduleEnd(Machine m){
        ScheduledFuture<?> prev = tasks.remove(m.getId());
        if(prev!=null) prev.cancel(true);
        long delay = m.getEndTime().getEpochSecond() - Instant.now().getEpochSecond();
        if(delay<0) delay=0;
        ScheduledFuture<?> f = scheduler.schedule(() -> finish(m.getId()), delay, TimeUnit.SECONDS);
        tasks.put(m.getId(), f);
    }

    private synchronized void finish(Long machineId){
        Optional<Machine> om = machineRepo.findById(machineId);
        if(om.isEmpty()) return;
        Machine m = om.get();
        m.setInUse(false);
        m.setCurrentUserId(null);
        m.setEndTime(null);
        machineRepo.save(m);

        List<QueueEntry> q = queueRepo.findByMachineIdOrderByCreatedAt(machineId);
        if(!q.isEmpty()){
            QueueEntry next = q.get(0);
            queueRepo.delete(next);
            m.setInUse(true);
            m.setCurrentUserId(next.getUserId());
            Instant end = Instant.now().plusSeconds(next.getMinutes()*60L);
            m.setEndTime(end);
            machineRepo.save(m);
            scheduleEnd(m);
        }
        notifiedQueueEntries.removeIf(id -> q.stream().noneMatch(e -> e.getId().equals(id)));

        broadcast();
    }

    public List<QueueEntry> getQueue(Long machineId){
        return queueRepo.findByMachineIdOrderByCreatedAt(machineId);
    }

    private void scheduleNotifier(){
        try {
            List<Machine> machines = machineRepo.findAll();
            long now = Instant.now().getEpochSecond();

            for(Machine m : machines){
                long startEpoch = (m.getEndTime() != null) ? m.getEndTime().getEpochSecond() : now;
                List<QueueEntry> queue = queueRepo.findByMachineIdOrderByCreatedAt(m.getId());

                long accum = 0L;
                for(int i=0; i<queue.size(); i++){
                    QueueEntry entry = queue.get(i);
                    long expectedStartEpoch = startEpoch + accum;
                    long secondsUntilStart = expectedStartEpoch - now;

                    if(secondsUntilStart <= 120 && secondsUntilStart > 0 && !notifiedQueueEntries.contains(entry.getId())){
                        Map<String,Object> payload = new HashMap<>();
                        payload.put("type", "PRE_NOTIFY");
                        payload.put("machineId", m.getId());
                        payload.put("machineName", m.getName());
                        payload.put("userId", entry.getUserId());
                        payload.put("secondsUntilStart", secondsUntilStart);
                        payload.put("minutesUntilStart", Math.ceil(secondsUntilStart / 60.0));
                        payload.put("expectedStartEpoch", expectedStartEpoch);

                        messaging.convertAndSend("/topic/notifications", payload);
                        notifiedQueueEntries.add(entry.getId());
                    }

                    accum += (entry.getMinutes() != null ? entry.getMinutes() : 50) * 60L;
                }
            }
        } catch (Exception ex){
            ex.printStackTrace();
        }
    }

    private void broadcast(){
        List<Machine> machines = machineRepo.findAll();
        List<Map<String,Object>> out = new ArrayList<>();
        for(Machine m: machines){
            Map<String,Object> mm = new HashMap<>();
            mm.put("id", m.getId());
            mm.put("name", m.getName());
            mm.put("inUse", m.isInUse());
            mm.put("currentUserId", m.getCurrentUserId());
            mm.put("endTime", m.getEndTime()==null?null:m.getEndTime().toString());

            List<QueueEntry> queueEntries = queueRepo.findByMachineIdOrderByCreatedAt(m.getId());
            List<Map<String,Object>> queueList = new ArrayList<>();
            for(QueueEntry q : queueEntries){
                Map<String,Object> qMap = new HashMap<>();
                qMap.put("id", q.getId());
                qMap.put("userId", q.getUserId());
                qMap.put("minutes", q.getMinutes() != null ? q.getMinutes() : 50);
                queueList.add(qMap);
            }
            mm.put("queue", queueList);
            out.add(mm);
        }
        messaging.convertAndSend("/topic/machines", out);
    }
}